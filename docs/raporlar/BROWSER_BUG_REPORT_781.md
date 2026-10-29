# Rapor781 — Eski stüdyo girişi ve gerçek tema görünürlüğü

Kullanıcının gönderdiği R722 synthetic voice studio görüntüsü eski Tk ekranıdır; R744/R751/R757 ortak Electron stüdyosu master içinde zaten vardır. Yeni bir tasarım yapılmış gibi sayılmadı. Yeni doğrulanan boşluk: `text_studio_window.Studio(args, command)` doğrudan çağrısı hâlâ eski Tk penceresini oluşturabiliyordu. Sınıf artık parametresiz çağrıda `ses-studyosu.bat` üzerinden ortak uygulamayı açar. Eski parametreler sessizce atılmaz; açık emeklilik uyarısıyla reddedilir. Eski draft yardımcıları tarihsel regresyonlar için korunur, Tk penceresi kuran constructor yolu kaldırılmıştır. Açık eski pencere bu değişiklikle otomatik kapanmaz.

Gerçek Windows görüntüsünde ikinci hata bulundu: hazır durumda `hidden` olan Ayarları yeniden yükle düğmesi ortak `.btn` display stili yüzünden görünüyordu. Stüdyo kapsamlı `[hidden]` kuralı bunu kapatır; native test artık yalnız attribute değil computed display de doğrular.

## Değişen dosyalar

- tools/voxcpm2/text_studio_window.py: doğrudan eski constructor/çalıştırma yolunu ortak girişe bağlar; eski override uyarısı.
- tests/test_studio_reference_drafts.py: Tk oluşturulmadığı ve ortak launcher çağrıldığı iki regresyon; mevcut iki döküm koruma kontrolü aynen sürer.
- src/renderer/text-voice-studio.css: semantic hidden durumunu ortak display kurallarından korur.
- tests/electron-text-voice.smoke.js: hazır durumda kurtarma düğmesinin gerçekten görünmediği ölçümü.

## Görsel kanıt ve tasarım incelemesi

frontend-design ve make-interfaces-feel-better okundu. Mevcut plain CSS ve ortak tema kullanıldı; yeni tasarım sistemi/bağımlılık/dış repo kodu eklenmedi. [TR koyu geniş](evidence781/studio-tr-dark.png), [TR dar yüzde125](evidence781/studio-tr-narrow-125.png), [EN açık yüzde125](evidence781/studio-en-light-125.png), [ölçümler](evidence781/acceptance.json). Geniş ve dar görüntüler açılıp incelendi. Ortak fontlar, amber odak/eylem, tek dil, bağımsız ayar/metin kaydırması mevcut. Yatay taşma yok, eylem yüksekliği en az40px; açık tema ikincil düğme kontrastı12.18:1. Hazır kurtarma düğmesi kaldırıldı. Yeni animasyon/icon eklenmedi; hareketin yüzde10 incelemesi yapılmadı. Ek gölge/animasyon ve ikinci Tk tema paketi ortak kimliği iyileştirmeyeceği için uygulanmadı. Tüm uygulama kusursuz iddiası yok.

## Kontroller ve sınırlar

- Python unittest test_studio_reference_drafts:4/4PASS; test_text_studio_launcher:3/3PASS.
- py_compile değişen Python, node --check native test, git diff --check PASS.
- Gerçek Electron main/preload/renderer ayrı test profili: son koşu exit0 complete:true, realGeneration:false.
- İlk sandbox denemesinde Windows cache erişim hataları/sonuç yok; ayrı yetkili profil koşuldu. İlk yetkili koşu fixture CRLF ile textarea LF farkında düştü; beklenti gevşetilmedi, yalnız sentetik fixture kopyası LF hazırlandı. Sonraki görüntüde kurtarma düğmesi hatası görüldü; düzeltme sonrası native tekrar PASS.
- Mevcut11 before-quit listener uyarısı sürer; dış ağ testte kasıtlı kapalı. GPU/model üretimi, insan dinleme, kişisel start.bat açılışı ve fiziksel dosya seçici doğrulanmadı. Test gerçek Windows penceresidir; üretim start.bat kabulü değildir.
- Motor, sentez varsayılanları, şema, IPC ve kişisel ayarlar değişmedi. CI açık; uzun sonucu beklenmedi.

Kullanım: D:\Whisper Local\ses-studyosu.bat veya uygulamadaki Metin/TXT stüdyosu. Yeni davranış eski açık test penceresini geriye dönük değiştirmez.
