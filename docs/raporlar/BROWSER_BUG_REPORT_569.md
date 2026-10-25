# Rapor 569 — Pasaj yer imi ve ses sürümü doğruluğu

25 Ekim 2026, P02. Başlangıç `82f358abf00eb252e1574a48a0d4de7a65d386bf`; ürün bitiş `6579a715f68e27af78879cae95b9ea32dc262295`. Dal `codex/book-reliability549`, PR487. Bu paket yeni okuyucu özelliği ve ona gerekli konum doğruluğu onarımlarıdır; yapay bug sayısı verilmez.

## Davranış

Takipli sesli okuyucuda seçili pasajı ve o anki ses konumunu kaydet. Bölümler arasında ortak listeden yer imine dön; kaldırma ve değişmiş metni açma eylemleri aynı şerittedir. Metin seçilmezse etkin konuşma grubunun metni kullanılır. Liste en fazla 100 kayıt tutar; dolunca eskileri sessiz silmez.

Yer imi kaynak kimliği, bölüm/sayfa, metin SHA256 ve çıktı kimliği taşır. Aynı çıktı için gerçek kaydedilmiş saniye kullanılır. Aynı metnin yeni sesinde yalnız tekil grup anahtarı+metin veya tekil pasaj eşleşmesi varsa güncel grubun gerçek başlangıcına döner. Tahmini kelime süresi üretilmez. Kaynak/metin değişmişse eski saniye uygulanmaz; kayıtlı alıntı ve bölüm metnini aç eylemi gösterilir.

İlgili onarım: yeni ses çıktısı seçildiğinde eski çıktının devam saniyesi sıfırlanır. Önceki okuyucunun geç gelen `book-progress` isteği artık çıktı/metin snapshot'ı uyuşmuyorsa reddedilir. Renderer kapanışında eski istek yeni ekranın durumunu değiştiremez. Yeni yer imi eklenmesi projeyi 6 MB okuma sınırının dışına çıkaracaksa diske yazmadan reddedilir.

## Dosyalar

- `src/book-bookmarks.js`: sınırlı kalıcı kayıt, güvenli çözümleme ve kaldırma.
- `src/media-workflows.js`: mevcut yetkili IPC üzerinden liste/aç/ekle/kaldır; çıktı kimliği ve ilerleme doğrulaması.
- `src/renderer/book-bookmarks-ui.js`: EN/TR şerit, seçili pasaj, durum/alıntı, güncel oturum kontrolleri.
- `src/renderer/index.html`, `media-workflows.css`: yerel CSP uyumlu script ve tema tokenlarıyla yerleşim.
- `src/renderer/media-workflows-ui.js`, `pdf-reader-experience.js`: doğru bölüm/ses açma, ilerleme snapshot'ı ve gecikmiş yanıt koruması.
- Üç test dosyası: model/IPC davranışı, mevcut okuyucu sözleşmesi ve native Windows etkileşimi.

## Kanıt ve sınırlar

18 hedefli sonuç geçti: `node --test tests/book-bookmarks.test.js tests/reader-audio-control.test.js tests/reader-pdf-lifecycle.test.js tests/book-chapter-link.test.js tests/csp-policy.test.js`. Syntax/diff kontrolü temiz.

Native Windows Electron ayrı profilde exit 0: `.uiprev/book-reliability549-1792920743462`. Gerçek DOM seçimiyle 1,25 saniyede kayıt, başka bölümden dönüş, gerçek WAV yenilemesiyle 2 saniyelik grup başına eşleme, metin değişikliğinde seek yapılmaması; PDF/EPUB/M4B önceki akışları geçti. Görüntüler incelendi; kişisel görüntüler Git'e eklenmedi. Model/IPC birim testindeki ses dosyası kontrollü stub'dır; native akış gerçek WAV ve FFmpeg kullanır. Bunlar gerçek TTS kalitesi kanıtı değildir.

Gerçek GPU/TTS, canlı API, kişisel `start.bat`, tüm CI/tam paket bu turda çalıştırılmadı. Yeni bağımlılık/kurulum yok. Proje JSON'una opsiyonel `bookmarks` alanı eklenir; eski projeler liste boş olarak açılır. Master merge yapılmaz. P02 tamam; P03–P10 halen açık.
