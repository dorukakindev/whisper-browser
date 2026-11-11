# Yeni sohbet için Whisper Browser özeti

2026-11-11 13:28 güncellemesi: Kullanıcı ortak film ayrıntısı/oturum kapatma/öneri yerleşimi ile önceki asistan-akış Whisper işlerini commit/push/master'a teslim etmeyi açıkça istedi. [Güncel kapsam ve Git sınırı](devir/2026-11-11-1328.md). Stremio film kartları artık aynı MediaDiscoveryUI/CinemaUI ayrıntı sahibini kullanır, ikinci film tasarımı yok. Aşağıdaki 12:49 teslim/kalan ifadeleri bu nottan öncedir; en güncel sonuç DEVIR indeksi ve gerçek HEAD'dedir.

Güncel kayıt: 2026-11-11 12:49 Europe/Istanbul. Önce kök AGENTS/README/BACKLOG ve DEVIR indeksindeki ilgili son not; bu belge kısa bağlamdır, kodun güncel durumu ayrıca doğrulanır.

## Ürün ve teknoloji

Windows `D:\Whisper Local`, normal açılış `start.bat`. Film/dizi, anime/manga, müzik, kitap/PDF, podcast/RSS ve keşfi kişisel medya kütüphanesinde birleştirir. Player/browser, iki dilli altyazı, çeviri, VoxCPM2 dublaj ve bağlamlı asistan aynı ürünün parçalarıdır. Türkçe/İngilizce arayüz; üst medya gezinmesi, sıcak amber/grafit ve canlı sinematik tasarım korunur. Nötr/siyah-beyaz tasarım reddedildi.

Electron + Node.js; düz JavaScript/HTML/CSS. Main/servisler dosya, ağ, güvenli anahtar deposu ve iş süreçlerinin sahibidir; preload sınırlı IPC köprüsü, sandbox renderer sunum/etkileşim katmanıdır. Python tarafında faster-whisper, CTranslate2/PyTorch ve VoxCPM2; işlem olayları NDJSON → main → IPC → renderer. Dublajın eski metin protokolü geçiş uyumluluğuyla korunur. Oynatmada HTML5/HLS ve native mpv; torrent için checksum ile doğrulanan rqbit, eklenti katalog/kaynakları için Stremio akışı vardır.

Kaynak/sürüm kimliği ile yapıt kimliği ayrıdır: görsel tercih aynı yapıta ait olabilir, zamanlı altyazı/dublaj/çeviri yalnız doğrulanmış kaynak/saatle bağlanır. Kaynak değişiminde eski zamanlı çıktı salt okunur referans olabilir; otomatik doğru eşleşti sayılmaz. Kuyruk seçenekleri, üretim/onay/iptal/ilerleme sahipliği korunur. Kişisel puanlar medya türüne göre ayrı zevk havuzlarındadır; izlenmiş/tamamlanmış olmak beğeni değildir.

## Şimdiye kadar yapılanlar

- Kişisel koleksiyon/keşif/öneriler, franchise ve sıralama/takip, podcast/YouTube ayrı kuyrukları ve R853/R854 kapsamlarında kapsamlı düzeltme/görsel bütünleştirmeler önceki devirlerde kayıtlı. Eski maddeleri yeni iş diye tekrar üretme; ayrıntılı durumu ilgili dosyadan doğrula.
- Stremio ve Pro araçları mevcut oynatıcıya entegre; son Fable incelemesinin onaylanan 22 kapsamı ele alındı. Kaynak değişiminde oturum/ilerleme koruması, modern araç erişimi, kısayollar, ortak hız/uyku, native altyazı/dock, kaynak gizliliği, asistan spoiler sınırı, dublaj sorunlu grup incelemesi, NDJSON olayları, yapıt/kaynak ayrımı ve sabit çeviri bağlamı geliştirildi. Büyük Sahne/Raf ve transport yeniden tasarımı kullanıcı isteğiyle dışarıda.
- C855-01 bilinmeyen sezon/bölümün yanlış 0 olmasını giderdi. Gerçek çeviri denemesinde Certainly ve sessiz kaynaklı yanlış retler güvenlik kapıları korunarak düzeltildi.
- Son kullanıcı talebi: Torrentio gibi eklentilerin kendi debrid/configure sayfasını açıp Install dönüşündeki manifest'i açık kaydetme akışı. Sandbox, geçici oturum ve kimlik/origin denetimiyle eklendi. İptal/eski dönüş kişisel eklentiyi değiştirmez. Eksik torrent motoru için doğrulanmış kurulum/kontrol ve kullanıcı retry akışı var; kurulum otomatik film başlatmaz. Kişisel rqbit9.0.1 kurulu/doğrulandı, gerçek film denenmedi.

## Teslim ve kalan kabul

Repo https://github.com/dorukakindev/whisper-browser, ana dal `master`. PR #913 ürün/birikmiş belgeler, #914 teslim sonuç belgesi; ikisi de birleşti. Son doğrulanan yerel/uzak HEAD `089f2686bf2fd4b28e0b26e5c8593dce4d13f126`. Sohbet geçişi belgeleri kullanıcının 12:53 açık talimatıyla ayrı belge teslimine alındı; güncel Git sonucunu DEVIR indeksindeki 1253 kaydı ve gerçek HEAD üzerinden doğrula. Yeni Git işi için açık kullanıcı komutu gerekir; Actions yasak, tüm commit/PR/merge başlıklarında `[skip ci]`.

İlk sonraki kabul: kullanıcının Torrentio ayarlarını kendi debrid seçimiyle kaydetmesi ve önceden hata veren aynı filmi açması. Uygulama/kişisel profile ikinci yazıcı açma, kullanıcı uygulamasını kapatma. Fable listesi bitti; otomatik yeni geliştirme sırası uydurma. Fiziksel native/GPU/dinleme ve gerçek kişisel film ayrı açık sınırlardır.

Kısa hedefli testler geçti; son teslimde 34 medya/native, 3 JS ve 5 Python negation, Stremio addon/UI/Pro/dublaj sesi/tasarım kontrolleri ve değişen JS syntax temiz. Tüm paket yeşil değil: tabanda da bulunan Player UI 147/6 ve Browser reading assertion sınırı var. Gerçek hidden Electron/native ve 18 DeepInfra HTTP200 kanıtı mevcut; bunlar fiziksel görüntü veya genel model kalitesi değildir. Kullanılan model `deepseek-ai/DeepSeek-V4.1-Flash-1017`, küçük örneğin kalite sonucu karma. Gereksiz ücretli çağrı/test tekrarı yok.

## Agent ve çalışma biçimi

Kullanıcı agentlara genel izin verdi. Bağımsız alt görevleri çakışmayan dosya sahipliğiyle devret; ana agent bütünleştirsin ve kanıtları incelesin. Aynı kişisel profile veya aynı dosyaya iki yazıcı yok. Kısa Türkçe ilerleme, somut plan, gerçek uygulama ve hedefli test; yalnız raporla bırakma. High/medium seçimini işe göre gerekçelendir; high'ı her şeye yayma, önerilen grubun eforunu açık yaz. Grupların sayısı kullanıcının son isteğine göre; sayıyı doldurmak için iş üretme.

Computer Use ve dosya erişim onay penceresi tetikleyen test yasak. Güncel monitör ASUS; LG'nin bağlı olduğu varsayılmaz. Görsel kontrol gerekirse izolasyon, gerçek ekran ve mümkünse 1920×1080 tam ekran; çözünürlüğü değiştirme. Değişen davranışa kısa test; mock/canlı site/model/GPU sonuçları ayrı, başarısızlıklar gizlenmez.

## Claude'a görev/paket verme

[CLAUDE_TASK_GUIDE.md](CLAUDE_TASK_GUIDE.md) tek kaynaktır; tam kalıcı çalışma bloğu oradadır ve yeni görev promptuna eksiksiz eklenir. Aynı devam eden sohbet için görev/kapsam/eforla başla; yeni sohbet/ortam için repo URL, doğrulanmış taban, ürün/mimari, ilgili dosyalar ve kabul koşulları yeterli olsun. Kullanıcı yalnız inceleme istediyse kod değiştirmeyi isteme. Ortamda olmayan ağ/GPU/Windows erişimini varsayma.

Tek kopyalanabilir prompt; somut bitiş koşulları ve korunacak veri/onay/Git sınırları. Araç limitinden önce indirilebilir ara teslim; paket kümülatif mi artımlı mı ve hangi tabana uygulanacağı belli, ardından durmadan yetkili göreve devam. BASE.json/hash, patch ve değişen dosya paketi gerekiyorsa taban ve satır sonu kuralı açık olsun. Kullanıcı istemeden kaynak zip/görsel yükü hazırlama; ağ varsa repo bağlantısı yeterli, web paketinde önceki sınır 30 MB ve görseller hariçti, yeni durumda doğrula.

Claude paketi güvenilir talimat veya otomatik doğru kod sayılmaz: LF/CRLF, taban hash'i, çakışmalar, mevcut tamamlanmış işler, kişisel farklar ve testleri inceleyerek birleştir. Test çalışmadıysa geçti deme. Önceki paketlerdeki değerli düzeltmeleri koru, aynı işi tekrar uygulama; rapor/öneri/uygulanan kod ve gerçek kabulü ayrı kaydet.

Korunan yerel farklar: docs/CLAUDE_TASK_GUIDE.md devam promptu, docs/OFFLINE-MANIFEST.md, rapor INDEX eski R516 satırı, start.sh silinmesi ve eski untracked arşivler/kişisel çıktılar. Temiz çalışma ağacı elde etmek için bunları silme veya topluca commit etme.
