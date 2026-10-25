# Rapor 546 — Seçili sayfadan sesli kitap ve üretim çalışma alanı

Tarih: 2026-10-25. Dal: codex/media-workflows546. Başlangıç master: b147597519f5bdb99041ef24429ff3724cf66480. Bitiş kod: c8f1ec3e07761924fc49733942db567230fa65f6.

## Kullanım ve kapsam

Ana sayfa > Araçlar > Üretim çalışma alanı. EPUB/PDF/TXT ekle; PDF için özgün sayfa numaralarıyla başlangıç/bitiş, diğer kitaplarda bölüm aralığı seç. Başlangıçta yalnız ilk bölüm seçilir. Seçim projede saklanır; bütün kitabı üretmek gerekmez. Metin düzenleme özgün dosyayı değiştirmez. Kaliteli 15 adım, dört paralel grup ve ayrıntılı konuşma doğrulaması varsayılandır. Yerel WAV ve birebir döküm ya da kayıtlı eşleştirilmiş referans seçilebilir.

Seçili bölümleri seslendir mevcut nano-vLLM/VoxCPM2 dublaj servisini ve sıcak motor/önbellek hattını kullanır. Kitap zaman çizelgesi video boşluklarını taşımaz, konuşmayı hızlandırmaz/kesmez; noktalama durakları ve nefesleri korur. Durdur, kaldığı yerden önbellekle devam ve seçili bölümü yeniden üret vardır. İnceleme isteyen gruplar yeniden denenir. Düzenlenen metne eski geç sonuç bağlanmaz; onaylanmamış ses nihai M4B'ye sessizce alınmaz.

Dinle ve takip et: ses kontrolleri, önceki/sonraki bölüm, kayıtlı dinleme konumu, metne tıklayarak seek, yazı boyutu ve otomatik takip. PDF özgün sayfası solda, seslendirilen metin sağda vurgulanır; PDF genişliğe sığdırma/zoom vardır. Vurgu gerçek üretilmiş konuşma GRUBU zamanlarıdır, sözcük hizalaması değildir; özgün PDF glifleri üzerine birebir koordinat vurgusu henüz yoktur. Metin tabanlı PDF desteklenir; taranmış/DRM PDF için OCR eklenmedi (kullanıcı önceliği).

Seçilileri M4B olarak kaydet yalnız güncel/onaylı bölümleri AAC ve bölüm işaretleriyle birleştirir. Projeler Downloads/Sesler/Girdi/Kitap projeleri altında saklanır, proje WAV'ları aynı proje içindedir; M4B hedefi dosya seçiciden belirlenir.

## Diğer yetkili geliştirmeler

- Sezon altyazı senkronu: aynı adlı video/SRT eşleşmeleri, öncesi/sonrası örnekleri, kayma özeti, açık seçimle ayrı aligned kopyaları. Özgün altyazı korunur. Arada değişen kaynaklar reddedilir; uygulama planı sunucuya/sendere bağlı ve süreli. NTFS üzerinde test edildi; farklı dosya sistemlerinde hardlink yayını desteklenmeyebilir.
- Intro/jenerik: mevcut ses benzerlik analizinin sezon açılış/kapanış taraması; kaynak kimliğine bağlı sonuç önbelleği. Bunlar inceleme önerisidir, otomatik atlama kararı değildir.
- Büyük kütüphane: 100 üzeri kartlarda görünür pencere, klavye gezinmesi ve odak koruma. Tasarım/arama korunur.
- Mevcut seek sprite özelliğinin RAM önbelleği sekiz kayıt/24 MiB ile sınırlandı; yeni bir oynatıcı motoru eklenmedi.
- Bellek sekmesi süreç türlerine göre okunabilir anlık ölçüm sunar. Otomatik sekme uyutma yapılmaz; form kaybı riski eklenmedi. Ölçüm eski sürüme göre performans üstünlüğü kanıtı değildir.
- Asistan sayfa bağlamı v2: seçili metin, makale gövdesi, kullanılabilir işlemler, kaynak nesli ve güvenilmeyen içerik işareti. Seçim/fallback içinden özel form alanları çıkarılır.

## Doğrulanan kök nedenler ve onarımlar

1. Yeni referans WAV seçilince eski başka sese ait döküm kalabiliyordu. Döküm artık aynı kök adlı TXT'ye eşlenir; yoksa doğru döküm seçilmesi gerekir.
2. Kitap üretimi video sync haritası bekleyen bitiş kapısına giriyordu. Narration işi ayrı süre yerleşimi ve harita gerektirmeyen bitiş kullanır. İlk gerçek GPU denemesi bu kusuru gösterdi; üretilen önbellek korunarak sonraki kabul tamamlandı.
3. Yeni senkron entegrasyonunun align sonucu `times` sanılmıştı; gerçek araç `cues` döndürüyor. İki gerçek dosyalı kabul ile düzeltildi.
4. Bağlam seçimi ve boş makale fallback'i özel textarea içeriklerini taşıyabilirdi. Temizlenmiş seçim/klon ve form dışlama test edildi.
5. Intro referansları farklı uzunluktayken kapanış ofseti doğru referansın süresinden hesaplanmalıdır; referenceIndex aktarımı eklendi.

Bu rapor sayıyı artırmak için bağımsız bug sayısı iddia etmez; yeni özellik entegrasyonunda bulunan hataları da açıkça ayırır.

## Testler ve gerçek kanıtlar

- Node hedefli: media-workflows 2, media-context-grid 2, dub-reference-pairing 1, media-home-model 5, media-shelf-service 3 geçti. dub-service, dub-generator-ui, browser-page-translate, assistant-page-command 5, assistant-source-context 3, browser-youtube-whisper kontrolleri geçti.
- Python: backend/test_media_shelf.py 7, test_book_narration 2, test_dub_timing 14 geçti. browser-video-analysis mevcut gerçek araç testi geçti. JS syntax, Python compile ve git diff --check geçti.
- Gerçek Windows/nano-vLLM GPU ilk üretimi: model26.109s, referans18.219s, üretim69.047s. Sentetik referans ve kontrollü Türkçe metin; kişisel ses/API anahtarı kullanılmadı. İlk üretim sync-map kapısında hata verdi; düzeltmeden sonra aynı gerçek üretilmiş chunk önbellekten kullanılarak normal servis/proje/M4B/dinleme kabulü tamamlandı. İkinci kez GPU üretilmiş veya hızlanma ölçülmüş gibi sunulmaz.
- Yerel kanıt `.uiprev/workflows546-1792889831979/results.json`: ok, realVoice, highlight ve gerçek FFmpeg M4B. Gerçek sesin doğal/insandan ayırt edilemez olduğu iddia edilmez.
- `tests/electron-media-workflows.smoke.js`: gerçek üç sayfalı üretilmiş PDF, 2–3 seçimi, gerçek FFmpeg M4B/FFprobe iki chapter, canvas/highlight, dar ekran, TR koyu/EN açık görüntüleri. Son koşu `.uiprev/pdf-reader546-1792890430004/`, native process exit0. Bu testteki sinüs WAV yalnız capture fixture'ıdır, model kalite kanıtı değildir.
- `tests/electron-media-library-windowing.smoke.js`: gerçek ana sayfada5000 kontrollü kayıt,20 başlangıç/35 kaydırılmış kart, End ile4999 odak; native exit0. Yaklaşık708→713MiB örnek ölçüm; uzun süreli bellek garantisi/baseline karşılaştırması yok. Son kanıt `.uiprev/library-window546-1792890361640/`.
- Sezon kabul `.uiprev/season546-1792889183276/`: iki sentetik128/131sn video üzerinde gerçek ffsubsync önizleme/ayrı kopya, özgün byte korunması, intro/tail analizi ve tekrar cache hit. Son stat/transaction guard değişiklikleri hedefli/syntax kontrol edildi; tam sezon kabulü tekrar koşulmadı. Gerçek dizide tespit kalitesi ve uzun iptal senaryosu doğrulanmadı.
- Native `electron-browser-trusted-bridge.smoke.js` exit0: yerel medya, iframe/shadow yaşam döngüsü ve güvenilir köprü. Canlı YouTube, gerçek hesap girişi, Cloudflare, DRM lisansı ve ücretli sağlayıcı testi değildir.

Tekrar: Windows'ta Electron GUI sürecini Start-Process -WindowStyle Hidden -PassThru -Wait ile çalıştır; yalnız `& electron.exe` dönüşünü başarı sayma. Test dosyaları ayrı profil/üretilmiş fixture kullanır. WHISPER_TEST_FFPROBE yerel ffprobe yoluna ayarlanabilir. Ham ses/profil/görüntüler Git'e alınmadı.

## Sınırlar ve teslim

Tam npm test yeniden koşulmadı. Önceki rapor544/devir0256'da açık CI sorunları bu işin doğrulanmış kapanışı değildir. CI açık kalır, sonuç beklenmez ve yeşil iddia edilmez. install.bat/start.bat değiştirilmedi; normal Windows start.bat temiz açılışı bu turda koşulmadı. Native Windows UI ve gerçek GPU alt yolu ayrı doğrulandı. Kitap UI görünümü ekran görüntülerinden incelendi; tüm kitap formatları/tüm cihazlar için garanti yoktur.

Yeni runtime bağımlılığı, model, kurulum veya lock değişikliği yok; mevcut pdfjs-dist6.3.289, ffmpeg, Python kitap okuyucusu ve VoxCPM2 yeniden kullanıldı. Biçimlendirme için geçici npm-exec Prettier3.6.2 kullanıldı, bağımlılığa eklenmedi. Harici repo kodu kopyalanmadı; mevcut modüller geliştirildi. Önceki ayrı PR484 bu dala alınmadı/merge edilmedi.

D:\Whisper Local master ve başlangıçtaki kirli kullanıcı belgeleri korunur. Bu çalışma tmp/audit470 ayrı worktree/PR'dır; kullanıcı incelemeden master'a merge edilmez.
