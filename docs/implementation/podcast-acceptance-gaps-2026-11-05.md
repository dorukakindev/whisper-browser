# Podcast kabul açıklarını kapatma

Taban b0f754da; dal codex/podcast-acceptance-gaps-20261105. Bu kayıt önceki genel tamamlandı iddiası yerine10 koşulun gerçek kaynak sahiplerine bağlı kabulünü izler.

1. Browser/YouTube mevcut BrowserStudy/BrowserPanel üstünden podcast dinleme görünümüne geçer; video/konum/hız/metin değişmez, ikinci ses yok. Üst W menüsü ve panelde görünür giriş, kompakt aynı transport ve büyük cümle metni; yeni kolon tasarımı/maket döngüsü yok. Mevcut grafik kimliği korunur. Kaynak/çeviri araçları açılabilir kalır.
2. Shelf RSS yeniden açmada registry kaydının özgün+çeviri metnini yükler; aynı kaynak için konum/hız döner. Uzak yayının fiziksel sürümü kanıtlanmadıysa indirilen ASR kaydı yalnız okunur; sahte seek yok. Açılış Whisper/çeviri çağırmaz.
3. Podcast asistanı browser zaman dönüşümlerini kullanır; soru zamanı ve medya/iz/sürüm bağını dondurur. Bu ana kadar kapsamında gelecek satır yok. Eski sonuç/kayıt yeni bölüme sızmaz.
4. Kısa hedefli testler ve izole gerçek Windows browser/RSS kontrolü. CUA/izin penceresi/CPU/matris yok; yeni sağlayıcı/GPU başarısı iddia edilmez. Son ürün/belge ayrı commit ve master/ana kopya doğrulaması.

## Uygulama ve kısa kabul tamam

BrowserPodcastUI mevcut BrowserStudy/BrowserPanel ve tek web video sahibini kullanır. Üst W menüsünde Podcast görünümü ve çift dilli panelde Podcast görünümüne geç girişi vardır. Transport mevcut kimlik/revizyon doğrulayan köprüye gider. İki iz, bağımsız drift/ofset dönüşümleri üzerinden video zamanına çevrilir; asistanın geçmiş kapsamına gelecek satır girmez. Son40 satır sınırında eksik kapsam ayrıca bildirilir. Shelf kaydı yeniden açmada kaynak+çeviri yüklenir; seçilmiş yayıncı kaydı eski registry çıktısıyla ezilmez. Registry indirme kanıtı uzak stream kanıtına dönüşmez. Salt okunur kayıt kaynak metni sabitlenerek mevcut çeviri kuyruğuna gider; seek açılmaz. Browser/player açılınca shelf sunumu kapanır ve eski asistan bağlamı etkin kalmaz.

Son kısa testler20/20 + browser-podcast/browser-study/player-workspace-runtime geçti. Syntax/diff ve CSS410/419 temiz. Eski bir testin aynı sürümde ASR çıktısına çizim izni bekleyen güncel olmayan fixture’ı, mevcut üretim publisher/translation sözleşmesini doğrulayacak biçimde güçlendirildi; üretim kapısı gevşetilmedi.

Gerçek Electron ana süreç/preload/renderer: kontrollü web MP4+2 WebVTT'de geçiş konum/hız/paused/kaynak/iki cue dizisini aynen korudu; tek WebContents/video ve2->12.01sn seek. Gerçek YouTube OHOpb2fS-cM sayfasında medya+iz gözlendi, podcast geçişinde kaynak/zaman/hız/paused korundu. Kontrollü RSS gerçek HTTP içe aktarma, test profiline ait HTTPS protokol WAV ve kayıtlı2+2 metin: yeniden açmada~7.3sn/1.5x, iki kayıt ve işlem çağrısı0/izin0. RSS sesi/çevirisi kontrollüdür, yeni canlı sağlayıcı/Whisper başarısı değildir. Önceki NPR12sn gerçek CUDA Whisper+DeepInfra4+4 kanıtı korunur. CUA/matris/CPU/tam suite yok.
