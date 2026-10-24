# Luna medya deneyimi — mevcut Whisper hattına altı bağlantı

Başlangıç `a4f0d59405ab71a7918a391f053236d115269c70`; ürün commit'i `ec3788dd7c457fe16227db59d7502cf9f3e4df49`. Dal `codex/luna-media-home532`, PR482. Kullanıcı altı önerinin uygulanmasını, mevcut gelişmiş Whisper'ın korunmasını istedi. Bu bir yeni motor/altyazı biçimi geçişi değildir.

## Uygulanan alanlar

1. **Bağlamlı ortak asistan:** açık kütüphane yapımı, Keşfet ayrıntısı ve kitap bölümü ayrı kaynak kapsamına alınır. Kitapta en fazla8000 karakterlik bölüm alıntısı verilir; eser tamamının bilindiği iddia edilmez. Özetle / ses hazırlığı / işlem merkezi önerileri kaynak-model/işlem önizlemesiyle açılır. Önizlemeyi açmak sağlayıcı çağrısı yapmaz. Onay eski AI kontrolcüsüne gider. Seçili yapım/kitap ayrıntısında, arkadaki başka videoya ses hazırlığı açan öneri sunulmaz; yapımın kendi oynat-hazırla eylemi kullanılır. Kullanıcı sorusu ve doğrulanmış kaynak düğmeleri önceki ortak hattı kullanır.
2. **İzlemeye devam et:** mevcut konum/hız/altyazı/offset geri yüklemesine dublaj kimliği, dublaj gecikmesi ve miks değerleri eklendi. Yeni yerel ses seçimi native dosya seçiciden geçer; app userData içinde kimlik→dosya kaydı tutulur. Watch prefs yalnız opaque ID taşır. Üretilmiş ses mevcut üretim günlüğünden tam iş kimliğiyle bulunur; bulunamayan kimlik başka videonun en son sesine düşmez. Geçersiz harita/eksik dosyada otomatik bağlama yapılmaz. Dublajın geçici video susturması ve dinamik hızı özgün tercih diye kaydedilmez.
3. **Yapım ayrıntısı:** mevcut afiş/açıklama/sezon-bölüm/kaynak düzenine kayıtlı altyazı sayısı, çeviri ve dublaj bağlantı durumu, “Oynat ve ses hazırlığını aç” eklendi. Bu rozetler kayıtlı bağlantılardır; tüm dosyaların şu an diskte bulunduğu veya model kalitesi onayı değildir. Seçili geçerli yerel SRT mevcut ses hazırlığına taşınabilir. Üretim kendi ayar/plan/kapsam incelemesinden sonra kullanıcının düğmesiyle başlar.
4. **Ortak işlem merkezi:** ana sayfadaki İşlemler, asistanın önerisi, yapım ayrıntısı ve Ctrl+Shift+J ile erişilir. Mevcut player/browser iş satırı ve eylemleri tekrar kullanılır; yeni ikinci kuyruk yoktur. Ses üretimi/arka plan ayırma aşamaları ve aktif video indirme aynı listede görünür. Pencereyi kapatmak bu modalı kapatır, işi iptal etmez; Durdur mevcut iş iptaline gider. Ses sonuçları Aç üzerinden mevcut sonuç/yeniden üretim arayüzündedir. Uygulama sürecini kapattıktan sonra yeni merkezde ses işi yeniden canlandırma iddiası yok; eski browser kurtarma ve dub günlükleri korunur.
5. **Keşfet tercihleri:** İzledim / İlgilenmiyorum önerilerden çıkarır; Tercihler bölümünden geri alınır. Beğeni/tür gerekçesi ve mevcut izlenecekler akışı korunur. Filtre/kartlar ve kaydırma geri dönüşte korunur. Bu tercihler kütüphane ilerlemesini veya puanını sessizce değiştirmez.
6. **Görünüm birliği:** yeni medya yüzeyleri, katalog, ses hazırlığı, işlem merkezi ve asistan ortak font/tema/kontrol diline bağlanır. İşlem modalı ortalanır, dar ekranda eylemler sarılır; asistan önizlemesi küçük yükseklikte kayabilir. Eski browser/stüdyo işlevleri ve kontrol ID'leri korunur.

## Bu tur doğrulamada bulunan gerçek hatalar

- Dublaj kaldırmada `remember(null)` senkron kayıt bildirimi, henüz yaşayan eski oturumdan yeniden descriptor alıyordu. Eski playbackAsset önce temizlenir; kaldırma sonrasında kayıt null kalır.
- Keşfet geri dönüşünde eski scroll olayı yeni root bağlandıktan sonra kayıtlı konumu0 yapabiliyordu. Ayrılma anında senkron snapshot ve geri yükleme koruması eklendi.
- Dublajın videoyu susturması/dinamik hızının kullanıcı tercihi gibi kaydedilmesi önlendi: controller'ın priorMuted/baseRate değerleri kullanılır.
- Yerel aynı dosyanın yeni oynatma nesli, eski mute/rate temizliğiyle karışmaması için UI context/mute/rate kontrolüne generation eklendi.
- Görsel kontrolde ortak işlem modalının sol üstte kalması düzeltildi (`margin:auto`); asistanın koyu temada beyaz native scrollbar'ı color-scheme ile eşlendi.

Test beklentisi hataları ürün bugı sayılmadı: yeni tercih kaydına dosya dizini sağlamayan eski Node fixture'ı düzeltildi. Bir SRT fixture'ında `loadSubtitle` select değerini eşitlemeden çağrılmıştı; üretim kodunun bayat okuma koruması doğru biçimde sonucu reddetti. Kontrol normal seçim akışı gibi kuruldu, koruma gevşetilmedi.

## Kanıt

- 13 hedefli Node sonucu geçti: assistant-overlay, browser-dub-audio, dub-generator-ui, dub-playback-assets, dub-service, dub-workspace-ui, media-catalog-service/store, media-discovery-service ve preload-sandbox. Çalışan davranış dosyalarının bazısı Node runner'da tek sonuçtur; toplamı yüzlerce yeni test gibi sunulmaz.
- Windows gerçek Electron/main/preload ayrı profilleriyle home ve discovery smoke geçti. Home son kanıt `.uiprev/media-home-smoke/1792836584601-21516/`; discovery `.uiprev/media-discovery/1792836350840-1628-fixture/`. Sentetik medya/poster ve kontrollü sağlayıcı kullanıldı; kişisel profil/Git'e ham ekran görüntüsü yok.
- Gerçek video+native ses seçimi, watch-profile üzerinden ses/offset geri dönüşü, mute=false ve hız1.25 korunması, eksik ses dosyasında özgün ses, kaldırmada null kayıt; seçili SRT'yi hazırlığa taşıma, üretim başlamaması ve Whisper seçeneklerinin aynı kalması doğrulandı.
- Keşfet tercih/geri alma UI, filtre/scroll geri dönüşü, native asistan önizleme-onay, kaynak bağlantısı, kitap/yapım bağlamı ve global işlem penceresini kapatınca iş satırının devam etmesi doğrulandı. Ses ayırma ilerlemesi burada kontrollü olay fixture'ıdır; gerçek GPU ayırma çalıştırıldığı iddia edilmez.
- Görseller incelendi: TR/koyu ses hazırlığı, yapım iş akışı, asistan önizlemesi ve ortalanmış işlem merkezi; önceki smoke'un EN/açık ve dar yerleşim kontrolleri de geçti. Native asistan kendi capturePage görüntüsüyle incelenir; main capture native child'ı içermez.
- Sözdizimi ve diff kontrolleri geçti. Tam npm test / CI beklenmedi. Testler kapatılmadı.

## Sınırlar ve kalıcılık

Whisper/transcribe/çeviri Python motorları, VoxCPM üretim/gruplama/prosodi kodları ve model varsayılanları değişmedi; bu, tüm eski davranışların hatasızlık garantisi değildir. Gerçek ücretli sağlayıcı, YouTube hesabı/DRM, GPU üretim kalitesi, tüm OS modal/fullscreen birleşimleri ve bu kodun normal start.bat başlatılması bu turda tekrar sınanmadı. App ayrı Electron fixture profiliyle açıldı.

Yeni userData dosyaları `dub-playback-assets.json` (native seçilmiş yerel ses kayıtları; en fazla2000), `media-discovery-feedback.json` (en fazla2000 tercih). Watch prefs'e isteğe bağlı `dubPlayback` eklendi; eski kayıtlarda yokluğu normaldir. Üretilmiş sesin kaynağı mevcut dub-logs ve managed output'tur. Ses dosyaları kopyalanmaz/silinmez; yerel dosya taşınırsa yeniden seçilmelidir. Bu yeni kimlik kayıtları ve dış ses dosyaları mevcut .wbp dışa aktarıma eklenmedi; tam userData/ses yedeği hâlâ gereklidir. İçe aktarılmış çok katmanlı dub projelerinin tüm harici katmanlarını otomatik geri bağlama bu turun iddiası değil; mevcut proje açma yolu korunur.

Bağımlılık/lock/kurulum güncellemesi yok. master `fb86bb3264cecc6acf3d6806b28780468e01072c` ve ana kopyadaki kullanıcı değişiklikleri korunur. Önceki ses PR481 ayrıdır. Bu dal PR482 üzerinden incelemeye sunulur; kendiliğinden master merge yok.
