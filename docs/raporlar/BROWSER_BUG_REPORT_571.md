# Rapor 571 — Kitap ses denemelerini karşılaştırma

P04, 25 Ekim 2026. Başlangıç `743192132196b8571fa264064e4d673e9d340d64`; ürün bitiş `60009a2bf4f13bde4554469387dd829514243b7d`. Dal `codex/book-reliability549`, PR487.

## Sonuç ve gerçek eksik

Mevcut capture yolu yeni sesi içerik kimlikli WAV dosyasına yazıyor ve eski WAV'ı silmiyordu; ancak eski grubun metin/kalite/zamanlama bilgileri c.groups üzerine yazılıyordu. Bu nedenle eski dosyayı güvenle karşılaştırmak ve seçmek mümkün değildi. Artık her sesin yanında sınırlı `.wav.take.json` bilgisi tutulur: tam metin/ses SHA256, doğrulanan gruplar, kalite/manuel inceleme bilgisi, üretim zamanı ve ses ayarları. Projenin JSON'una bütün denemelerin uzun grup metinleri yüklenmez.

Bölüm editöründeki **Ses denemelerini karşılaştır** paneli mevcut ve seçili kaydı yan yana yükler. Aynı anda yalnız bir kayıt çalar. **Bu denemeyi kullan**, yalnız kaydedilmiş güncel metinle tam eşleşen, dosyası doğrulanan denemeyi seçer; kalite durumunu veya review grubunu otomatik onaylamaz. Eski metnin sesi dinlenebilir ama seçilemez. Seçim eski WAV/metadata dosyasını silmez. Yeni seçimin resume'u sıfırdır; yer imi P02 kurallarıyla çözülür.

Üretim/aynı proje dışa aktarımı sırasında seçim reddedilir. UI'daki hazırlama aşaması da busy kontrolüyle korunur. Boşta yapılan açık seçim, o bölüme ait hazırlanmış ama başlamamış iş kaydını geçersiz kılar; gecikmiş eski capture yeni seçimi değiştiremez.

Geçerli eski ses bilgisi yeni capture öncesinde saklanır. Önceki dosya dışarıdan silinmiş/bozulmuşsa bu karşılaştırma eksikliği yeni başarılı sesi engellemez; açık historyIncomplete uyarısı kaydedilir. Eksik WAV'ın geçerli metadata kaydı listede dosya yok olarak görünür. Dosyalar değiştirilmez/silinmez. Dinleme/seçimde içerik kimliği denetlenir; path/symlink reddi korunur.

## Sınırlar

- Mevcut ses + son kaydedilmiş en çok 30 karşılaştırma bilgisi okunur; sınır varsa UI söyler. Daha eski dosya/metadata fiziksel olarak korunur. Metadata erişimi kayıt başına en fazla 1 MB, grup sayısı en fazla 1000.
- İçeriği ve metni birebir aynı WAV, ayrı bir ses denemesi sayılmaz; mevcut içerik kimliği kullanılır.
- Özellik öncesinden kalan sahipsiz WAV'lara tahmini metin/kalite bilgisi uydurulmaz. Geçerli mevcut kayıt, sonraki capture/seçimde metadata ile korunur.
- Bu A/B dinleme ve seçme özelliğidir; gerçek insan sesinin hangi denemede daha doğal olduğunu otomatik kanıtlamaz.

## Dosyalar ve sözleşme

`src/book-voice-takes.js`: metadata saklama/listeleme, güvenli dosya doğrulama, metin eşleştirme, seçme ve önceki kaydı koruma. `src/media-workflows.js`: capture snapshot'ları, book-takes/book-take-listen/book-take-select yetkili IPC eylemleri; kilitler ve bekleyen işin seçime bağlı geçersiz kılınması. `src/renderer/book-voice-takes-ui.js`: EN/TR karşılaştırma ve açık seçim, gecikmiş yanıt/teardown koruması. `index.html`, `media-workflows-ui.js`, `media-workflows.css`: yerel script, yaşam döngüsü ve tema uyumlu panel. `tests/book-voice-takes.test.js` ve native smoke ekleri davranışı doğrular.

Yeni runtime bağımlılığı/kurulum yok. Yan dosya formatı version1; chapter'a opsiyonel capturedAt/takeHistoryIncomplete alanları eklenir. Önceki projeler açılır; toplu migration veya dosya temizliği yapılmaz.

## Kanıt

16 hedefli PASS: book-voice-takes, book-bookmarks, book-reliability, book-export, book-regenerate-request, csp-policy. Son eksik-dosya listeleme değişiminden sonra book-voice-takes tekrar PASS. Syntax/diff temiz.

Windows gerçek Electron ayrı profil `.uiprev/book-reliability549-1792921687459`, exit0: iki gerçek kontrollü WAV metadata yükleme/oynatma, eşzamanlı çalmama, UI üzerinden eski denemeyi seçip yeniye geri dönme, eski dosyanın korunması; PDF/EPUB/M4B/yer imi akışları. Görüntü incelendi. Native sonrası yalnız eksik WAV'ın metadata'dan listelenmesi ve kullanıcı hatası netleştirmesi yapıldı; hedefli hizmet testi geçti. Birim test sesleri depolama stub'ıdır, native gerçek PCM/FFmpeg kullanır.

Gerçek TTS/GPU, ücretli/canlı API, kişisel start.bat, tam paket/CI bu turda çalıştırılmadı. Kişisel uygulama ve ana checkout korunur, otomatik master merge yok. P04 tamam; P05–P10 açık.
