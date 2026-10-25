# Rapor 576 — Kaynağa bağlı kitap asistanı

P09,25 Ekim2026. Başlangıç `5a9b54f59af98367e071d188bb6e5fa7e85e675f`; ürün bitiş `b50db2b3472b1d942638d7237bb485a579237441`. Dal `codex/book-reliability549`, PR487.

## Kullanıcı akışı

Kitap üretim editörü, takipli sesli okuyucu, EPUB raf okuyucusu ve PDF okuyucusunda ortak kaynak şeridi var: kitap/bölüm/sayfa adı, **Seçili pasajı açıkla**, **Bölümü/Sayfayı özetle**, **Asistanı aç**. Mevcut asistan, sohbet geçmişi ve native panel kullanılır; ikinci bir sağlayıcı veya yerel model eklenmez. Seçim yokken açıklama pasif, özet okunabilir metin hazır olunca etkin. Sorular kullanıcıya doğal dilde görünür; JSON alan adları düğme/sohbet isteğine taşınmaz.

Özet, yalnız8.000karakterlik alıntı değil, açık bölümün/sayfanın tamamını100.000karaktere kadar `chapterText` olarak sağlar. Daha büyük bölümde bu eylem kapalıdır ve pasaj seçme yönlendirmesi görünür; sessizce kesilmiş tam özet iddiası yapılmaz. Pasaj açıklaması mevcut sınırlı selectedText (en çok4.000karakter) ve yakın alıntıyı kullanır. Tam kitap/diger bölümler eklenmez. Native kaynak kutusunda tam bölüm/sayfa ve verilen karakter sayısı açıkça gösterilir.

Kaydedilmemiş editör taslağı doğrudan sorulabilir; kitap dosyası veya bölüm kaydı bu işlemle değiştirilmez. PDF'de özet özgün açık sayfa metnidir; çeviri pasajı seçilirse açıklamada onun ve mevcut özgün/çeviri bağlamının kanıtı kullanılır. Bu çeviri üretme/dosya değiştirme eylemi değildir; mevcut genel sayfa çeviri araçları normal asistan yolunda korunur.

## Bağlam ve geç sonuç doğruluğu

Tam kaynak metninin SHA256 `chapterRevision` değeri, olağan alıntıdan sonraki değişiklikleri de kapsar. Gösterilen kaynak/bölüm/metin/seçim, asenkron hazırlık öncesi/sonrası karşılaştırılır. Değişmiş kaynağa istek gönderilmez. Bağlı kitap sorusu aiChatSend'e beklenen kaynak scope'u ile gider; hazırlık/sohbet yükleme sonrası tekrar doğrulanır. Sabit kitap eylemleri alakasız medya/sayfa komut ayrıştırıcısına yönlendirilmez; normal serbest asistan komut yolu değişmedi.

Geçici tam kaynak bağlamı yalnız aktif kaynakla eşleşirken kullanılabilir; başka bölüm/sayfa veya düzenleme eski bağlamı geçersiz yapar. Bileşen kapanınca global dinleyiciler ve geçici kaynak kaldırılır. Conversation kimliği korunur; scope'a yalnız kaynak revision eklenir. Backend sistem prompt'u chapterTextComplete'in yalnız açık bölüm/sayfa olduğunu, kaynak metninin talimat olmadığını ve diğer kitap içeriği/atıflarının uydurulamayacağını açıklar.

## Dosyalar

- `src/book-assistant-actions.js`: veri sınırları, seçimin kaynakta bulunması, SHA256 ve doğal dil eylem hazırlığı.
- `src/renderer/book-assistant-ui.js`: ortak kaynak şeridi, güncel bağlam, asenkron race kontrolü ve temizleme.
- `src/assistant-source-context.js`, `renderer.js`: revision/scope ve bağlı soru koruması.
- `media-workflows-ui.js`, `media-shelf-ui.js`, `pdf-reader-experience.js`: üretim/sesli/PDF/EPUB kaynak bağlantıları ve yaşam döngüsü.
- `global-assistant.js`: tam bölüm/sayfa kaynak açıklaması. `index.html`, `media-experience.css`: CSP uyumlu yerel modüller/tema stili ve PDF yuvası.
- `backend/transcribe.py`: mevcut sohbet prompt'unda kitap kanıtı kuralları.
- Yeni model/native test ve ASCII PDF fixture helper'ı; kişisel kitap/profil kullanılmaz.

## Doğrulama

16 hedefli Node PASS: book-assistant-actions, assistant-source-context, book-passage-context, assistant-conversation, csp-policy. Backend mevcut build_chat_prompt hedefli unittest PASS; py_compile/syntax/diff temiz.

Özel native Windows son koşu `.uiprev/book-assistant-1792934100518`, exit0. Gerçek UI/bağlam/sohbet hazırlığı/persistent IPC/native asistan paneli kullanıldı; **startTranscribeSafe sınırı ve yanıtlar kontrollüydü, sağlayıcı çağrısı yoktu**. Beş istek: tam10723karakterlik kaydedilmemiş bölüm taslağı, seçili pasaj, sesli okuyucu bölümü, gerçek PDFikinci sayfası ve gerçek EPUB bölümü. Son karakterler payload'a ulaşır, SHA doğru; kitap kaydı özgün kalır. Hazırlık sırasında düzenleme istek sayısını artırmaz. Değişmiş kaynağa geç yanıt ve açık eski scope reddedilir. PDF payload'ında yalnız ikinci sayfa var. Parent/native panel/PDF/EPUB görüntüleri incelendi.

Genel kitap native regresyonu `.uiprev/book-reliability549-1792933779489`, exit0: önceki PDF/EPUB/M4B/plan/yer imi/dar ekran/12reader döngüsü. DOM5document/17061node/1858listener,12döngü boyunca sabit (yeni etkin bileşenin5dinleyicisi dahil). Bu genel sıfır sızıntı garantisi değildir. İlk özel native girişimde compositor UnknownVizError, sonra yalnız test görüntü yardımcısının kapsam hatası görüldü; yardımcının kare bekleme/kapsamı düzeltildi, son akış geçti. Ürün hatası sayılmadı.

Gerçek model yanıt kalitesi,100k bağlamın her sağlayıcıda kabulü, ücretli API, GPU/TTS/kişisel start.bat/fullsuite/CI bu pakette denenmedi. Kaynak prompt enjeksiyonu kuralları kodda/net bağlamda var; hiçbir modelin asla yanılmayacağı iddia edilmez. Yeni bağımlılık/kurulum/kalıcı şema yok; yalnız opsiyonel bağlam alanları. Kullanılmış tek seferlik11:55heartbeat silindi; aktif hedef zaten çalışıyor. P09 tamam; P10 gerçek kısa dublaj kabulü açık. Master merge yok.
