# Rapor 654 — Asistanın gerçek işlem ve ayar kontrolü

Başlangıç `ad28da9546e68919456dfd9104c7822dabab8e5d`; ürün `6ccf0433f6c7e24abf47bbe312015e3667098b4c`; dal `codex/assistant-workflow654`.

## Uygulanan kapsam

- Dört alanda 23 gizli olmayan kontrol: transkripsiyon modeli/motoru/kaynak dili/aygıt/precision/beam/bölme/sarma/genişlik (9); çeviri hedefi/seslendirmeye uygunluk/iyileştirme/esnek kontrol (4); altyazı gösterimi/gecikme/boyut/arka plan/kontur/font/kalınlık/çift düzen/ikinci gecikme (9); asistan Flex (1).
- `get_workflow_settings`, `configure_workflow`, `undo_workflow_settings` araçları mevcut gerçek kontrolleri ve seçenekleri okur. Serbest kontrol kimliği, dosya yolu, API anahtarı veya endpoint kabul etmez. Ayar kaydı iş başlatmaz; kuyruk ve çalışan işlerin dondurulmuş ayarları korunur.
- Kart özeti açık değişiklikleri gösterir. Ana süreç teklif anındaki ayar kimliğini uygula öncesi tekrar doğrular. Elle değişmiş ayar eski kartla ezilmez. İşlem sırasında elle değişiklik varsa o değer korunur; hâlâ bu işlemin değiştirdiği değerler geri alınır. Geri alma yalnız son asistan düzenlemesinden sonra değişiklik yapılmadıysa geçerlidir. Kayıt/geri alma hatası açık raporlanır.
- Seslendirmeye uygun çeviri seçildiğinde etkin refine/lenient öncelikleri modelin okuyabildiği sonuçta ayrıca belirtilir.
- Görünür oynatıcının konum/süre/hız/ses seviyesi okunur; ses seviyesi mevcut browser `volume-set` veya yerel video yüzeyine bağlanır. Park edilmiş video kontrol edilmez.
- Kütüphane ve Keşfet okuma, zevk profili, yorum yükleme ve konu çevirisi kaynak araçları diğer ekranlardan kullanılabilir. Koleksiyon mutasyonlarının kaynak kapsamı korunur.

## Doğrulanan hata

`Whisper modelini tiny ve beam 3 yap` eski regex tarafından üretim komutu sanılıyor ve YouTube açılmasını istiyordu. Ayar/model/engine/beam vb. istekler artık tipli ajan yoluna bırakılır. Gerçek açık transkripsiyon komutları regresyon testleriyle korunur. Karma model+üretim isteği önce doğru araç planlamasına gider; otomatik üretim sayılmaz.

## Test ve kanıt

- Son hedefli paket 9 dosya, 61 test girdisi geçti: workflow654, capabilities, library, agent service, app actions, voice, book, captions ve video intent.
- Daha önce provider dahil 52 kontrol geçti. İlk statik yetenek sayısı testi eski 33 beklentisi yüzünden kırmızıydı; yeni araçlarla birlikte benzersizlik ve somut kullanılabilir araçlar doğrulanacak şekilde güncellendi; kapsam eşiği gevşetilmedi.
- Windows native `electron-assistant654.smoke.js` exit 0: ayrı profil, gerçek main/preload/renderer, standart katmanlı kontrollü sağlayıcı; 15 fixture yanıtı, 4 uygulanan kart, elle değişiklik sonrası reddedilen eski kart. Kalıcı model ve ayar değerleri, çeviri geri alma, subtitle görünümü ve üretim başlamadığı doğrulandı.
- Native ilk koşu gerçek regex yönlendirme hatasını ortaya çıkardı; kod düzeltildikten sonra geçti. Son `.uiprev/assistant654/1793116358259-19892/` TR koyu ve EN açık dar görünüm kanıtları; TR eski kart hata görüntüsü incelendi. Kişisel profil/görüntüler Git'e konmadı.
- Değişen JS sözdizimi ve diff kontrolü geçti. Kontroller gerçek DeepSeek karar kalitesi değildir; ücretli/live API, GPU/model, canlı YouTube, start.bat açılışı ve tam test paketi çalıştırılmadı. CI açık; sonucu beklenmedi. Fixture ağ izolasyonunda reklam filtre indirmesi engellendi; reklam engelleme testi değildir.

## Dosyalar ve sınırlar

`assistant-workflow-settings.js` sınırlandırılmış şema; renderer `assistant-workflow-actions.js` actual control adapter ve güvenli geri alma; capabilities/agent service/provider araç sözleşmesi ve kimlik kontrolü; video-intent ayar/üretim ayrımı; app/library actions yönlendirme ve playback; agent-ui hata yerelleştirme; index script sırası. İlgili yeni/var olan testler güncellendi. Yeni bağımlılık, IPC kanalı, kurulum veya kalıcı ayar şeması yok; var olan ayarlar kullanılır.

Bu teslim tüm IPC'leri veya bütün uygulamayı sınırsız yönetme iddiası taşımaz. Gizli sağlayıcı ayarları, serbest dosya işlemleri ve bağlanmamış özellikler erişime açılmadı. Mevcut kitap/dublaj araçları korunarak hedefli regresyonla denetlendi. İnsan onay kartı ve exact job/source sahipliği devam eder.
