# Rapor757 — Eski Tk görüntüsü ile güncel ortak ses stüdyosunu ayırma

Gönderilen görüntü pencere başlığında R722 synthetic voice studio yazan eski Tk test ekranıdır. Bunu yeni ekranın kabul görüntüsü saymak doğru değildir. R744 yönlendirmesi ve R751 düzeni zaten master içindedir; aynı düzeltme yeniden bug/özellik sayılmadı. Güncel ana kopyanın Python giriş dosyası, ortak stüdyo JS/CSS dosyaları origin/master ile aynı; `ses-studyosu.bat` WHISPER_OPEN_TEXT_STUDIO bayrağıyla start.bat çağırıyor. Eski açık pencerenin/harici kısayolun bu bilgisayardaki kökeni yeniden üretilmedi.

## Güncel Windows doğrulaması

`tests/electron-text-voice.smoke.js` mevcut sentetik referans ve ayrı profil ile yeniden çalıştı; exit0, complete:true, realGeneration:false. Gerçek main/preload/renderer görüntüleri açılıp incelendi. [Türkçe koyu geniş](evidence757/studio-tr-dark.png), [Türkçe koyu dar yüzde125](evidence757/studio-tr-narrow-125.png), [İngilizce açık yüzde125](evidence757/studio-en-light-125.png), [ölçümler](evidence757/layout.json).

Etiketler tek dilde; ortak tema ve amber vurgu mevcut. Geniş ekranda metin ve ayarlar bağımsız kayıyor; dar ekranda tek akış var, yatay taşma yok, alt eylemler görünür. Açık tema ikincil düğmelerin kontrastı 12.18:1. Yerel referans seçimi, metni yeniden açınca koruma ve hazır ayar geçişleri mevcut kısa test içinde geçti.

## Tasarım kararı ve sınırlar

Tasarım önceliği AGENTS.md içinde zaten kalıcıdır: yalnız işlevsel olmak teslim için yeterli değildir; ortak tema, yerelleştirme, dar ekran ve Windows görüntüsü gerekir. frontend-design ve make-interfaces-feel-better okundu. Bu tur mevcut arayüz doğrulandı; yeni ürün kodu, yeni bağımlılık veya dış repo kodu yok. Ürün başlangıç/bitiş kimliği adce05dc2493a0b5d476508840950b756535b399. Gereksiz yeni test veya tam paket çalıştırılmadı. Kişisel açık uygulama/ayarlar korunur; fiziksel dosya seçici, start.bat üzerinden kişisel açılış, GPU ve ses kalitesi bu koşuyla doğrulanmaz. Mevcut 11 before-quit listener uyarısı sürüyor; testte ağ kasıtlı kapalı. CI beklenmedi. Tüm uygulamanın tasarımı kusursuz iddiası yok.
