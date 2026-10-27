# Rapor671 — Spotify/listeler/internet → doğrudan analiz ve referans

## Gerçek eksik
Önceki aktarımda Spotify listesi oynatılabiliyor ama analiz yalnız yerel dosya kabul ediyordu; internet sonuçlarında da referans yapma yoktu. Kullanıcının ekranları bu kopukluğu doğruluyor. Bu teslim kaynakları mevcut DSP/CLAP akışına bağlar, ayrı sahte ölçüm üretmez.

## Kullanım
- Müzik → Spotify’dan aktarılanlar → parçadaki **Analiz et**: incelenmiş YouTube karşılığı hazırlanır ve DSP analizi otomatik başlar.
- Analiz → **Müziklerimden seç**: yerel arşiv ve aktarılan Spotify listelerini parça/sanatçı/liste adıyla ara, kaydı seç. En fazla100görünen eşleşme; büyük arşivde aramayı daralt. Yeni kaynak otomatik analiz edilir.
- Analiz → İnternette → sonuçtaki **Analiz et / Referans yap**: bilinen güncel katalog kaydının önizlemesi alınır, kaynak seçilir ve analiz başlar. CLAP etiketleri, arşivde benzer bulma veya internet önizlemelerini karşılaştırma aynı seçili kaynağı kullanabilir. CLAP hazır değilse mevcut model hazırlama gereksinimi sürer.
- Yerel dosya seçimi korunur. Açık analiz penceresine dışarıdan başka Spotify parçası gönderilince sadece odaklamak yerine o kaynak seçilir; devam eden iş varsa anlaşılır bekleme mesajı verilir.

**Ölçüm sınırı açık:** Spotify doğrudan ses vermez; kaydetmeden önce incelenen YouTube sürümünün ilk en fazla90saniyesi kullanılır. İnternet kaydı Deezer'in en fazla30saniyelik önizlemesidir. Tam eser veya Spotify ses analizi diye sunulmaz. Origin/excerptSeconds asistan bağlamında da vardır. Her iki geçici WAV yerel olarak analiz edilir; analiz için harici modele ses yüklenmez.

## Tasarım
Kaynak ve kaynak seçimi üstte; temel analiz işlemleri, oynatım ve sekmeler önce gelir. Referans karışımı ve İngilizce ses tarifi varsayılan kapalı **Ses yönü ve referans karışımı** içinde. Böylece kullanıcının ekranındaki büyük ayar duvarı sonuçtan önce alan kaplamaz. Sekmeler kaydırmada görünür kalır. İnternet sonuçları eylem gruplarına sahip grid düzene geçer; dar ekranda eylemler taşmadan alt satıra iner. Aktarılan listelerde işlem aralıkları düzeltildi. Yalnız Spotify listesi olan kitaplıkta boş yerel arşiv mesajı ve işlevsiz0-parça filtreleri gizlenir. Türkçe “O saniyeyi” metni yerelleştirme karışıklığı yaratıyordu; “Dinlemek istediğin noktayı grafikte seç” yapıldı. Geniş/dar ve seçici görüntüleri incelendi.

## Altyapı ve sınırlar
Yeni `music-remote-source.js` penceredeki mevcut hizmetlerle çalışır: Deezer yalnız known snapshot ID ve mevcut8MB/25sönizleme okuyucusu; Spotify yalnız diskten doğrulanmış liste/parça ID ve kayıtlı YouTube URL'si. Keyfî renderer URL'si/yolu alınmaz. YouTube çözümü mevcut spotify-import motorudur; HTTPS googlevideo URL doğrulaması korunur. FFmpeg yalnız bu doğrulanmış akıştan90saniye,15sI/O ve90sişlem süresiyle mono48kWAV üretir. Deezer dosyası file/pipe protokolüyle en fazla30saniye dönüştürülür. Geçici sıkıştırılmış örnek kaldırılır. Pencere başına en fazla8hazırlanmış kaynak; daha fazlasında paneli kapatıp temizleme mesajı.

İptal kaynak çözme/dönüştürmeye de gider. Başarısız/iptal kaynak yayınlanmaz, geçici klasör temizlenir. Başarılı WAV panel kapanana kadar karşılaştırma için tutulur; kapatmada analiz işlemi kapandıktan sonra silinir. Pencere yok olurken de kapatma/temizleme başlatılır. İşletim sistemi zorla öldürmesi veya elektrik kesintisinde temizliğin garantisi yoktur. Kişisel kaynak silinmez. Yeni paket/model/kurulum/IPC kanalı yok. Özgün kaydın başka bölümünü seçerek indirme bu tur yok;90s/30s sınırından sonrasını seçemezsin. İnternet erişimi ve YouTube bölge/bot kısıtlamaları hâlâ hata verebilir.

## Kaynak incelemesi
Mevcut Spotify aktarımı, Deezer samples(), bounded process runner ve analiz source registry kullanıldı. yt-dlp'nin [resmî seçenekleri](https://github.com/yt-dlp/yt-dlp#download-options) ve kurulu motor akışı incelendi; yeni kaynak kod kopyalanmadı, lisans değişmedi. Frontend Design ve mevcut CSS token yaklaşımı izlendi. Bu, Luna görünümünü birebir kopyalamak değil, kullanıcı tarafından gösterilen kopuk akışı düzeltmektir.

## Doğrulama ve başarısız denemeler
-11hedefli Node PASS: yerel analiz/iptal/izin, katalog snapshot/URL/önizleme, asistan bağlamı, yeni kaynak decode süresi/protokol/geçici temizlik ve iptalde yarım kaydın reddi. Spotify mevcut4kontrolü de hazırlık sırasında PASS.
- Windows gerçek Electron `tests/electron-music671.smoke.js`, son `.uiprev/music671/1793139961151`: Spotify satır düğmesi →90snYouTube kesiti → gerçek DSP/dalga; kaynak seçicide liste; canlı California Dreamin araması → katalog sonucu düğmesi →29,975sönizleme → gerçek DSP; gerçek pinli CLAP etiket analizi; gelişmiş ayarın kapalı olması; dar ekranda taşmama; kapanınca geçici WAV'ın gerçekten silinmesi PASS.
- İlk Node fetch ve ardından Chromium fetch ile Google sesini bütünüyle alma denemeleri zaman aşımı/iptal verdi. Testler başarısız olarak bırakıldı; TLS veya test eşiği gevşetilmedi. Doğrulanmış akıştan yalnız90saniyeyi FFmpeg ile okuyan yol8saniye civarında tüm native akışı tamamladı. Bu süre genel performans garantisi değildir.
- Görsel kanıtlar kişisel olmayan profildendir. Üç görüntü incelendi. Ham ses/akış adresi/API anahtarı/profil Git'e eklenmedi. JSsyntax ve diff PASS. Eski11listener uyarısı açık.

Tam paket/CI, kişisel start.bat, temiz kurulum, GPU/DRM, canlı LLM seçimi veya insan müzik benzerliği kalitesi bu tur doğrulanmadı. CI açık kalır ve beklenmez. Asistan kaynak türünü bilir; kendisi müziği dinledi iddiası yok. Hedefli yerel ve gerçek entegrasyon sonuçları bütün internet kaynaklarının çalıştığı anlamına gelmez.
