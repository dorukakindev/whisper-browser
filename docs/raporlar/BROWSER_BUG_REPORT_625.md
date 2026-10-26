# Rapor 625 — P08: gerçek sonuçlarla birleşik asistan akışı

27 Ekim 2026, Windows. Başlangıç `d4e58e356857e8b4636d78a20399f36a8e11dd21`; bitiş ürün `1abcb5b5fb9e84b1e130823d443665b65e338860`. Dal `codex/assistant-flows625`. P01–P07 tekrar uygulanmadı; P08 mevcut kayıtlı araçları birleştirir. Yeni bağımlılık, IPC kanalı veya motor değişimi yok.

## Kullanım ve sözleşme

Asistandan birden fazla adım iste. Önce değişiklik kartını inceleyip uygula; **Sonuçla devam et** ile ilk isteğin ve gerçek işlem sonucunun kullanıldığı bir sonraki öneriyi al. Devam, mevcut son asistan yanıtını genişletir; kullanıcı ve asistan baloncuklarını çoğaltmaz. Sonraki değişiklik de ayrı karttır; otomatik uygulanmaz. Sadece uygulama düğmesine basmak yeni sağlayıcı isteği göndermez.

Main, kaynak/sohbet/gönderen bağlı, tek kullanımlı ve on dakika geçerli devam kimliği üretir. En fazla sekiz uygulanmış adım ve elli bekleyen devam saklanır. Tamamlanmış aynı araç/argüman yeniden çalıştırılmaz. Bir kart uygulanınca aynı eski planın diğer bekleyen kartları geçersizleşir; sonraki öneri sonuçtan yeniden oluşturulur. Kaynak/sohbet değişimi, eski kart, yabancı gönderici, iptal ve geç gelen yanıt kontrolleri korunur. İşlem uygulaması main ve renderer'da tekilleştirilir.

`accepted`, tamamlandı demek değildir. Whisper, tek aralıklı altyazı çevirisi ve kimliği dönen ses işleri **backend iş ID → main ledger ID** eşlemesiyle izlenir. Başka bir tamamlanmış iş, bu işin tamamlandığını kanıtlamaz. Devam sırasında ilgili iş sürüyorsa modele istek yapılmadan bekleme mesajı verilir; başarısız/durdurulmuşsa ilerlenmez. İş bitişi sesin doğal/eksiksiz okunduğu kanıtı değildir.

Kesin kimliği dönmeyen sayfa çevirisi ve çok bölümlü/çok aralıklı üretimde güvenilir tamamlanma bağlantısı kurulmaz; devam düğmesi yerine İşler bölümünü takip etme açıklaması gösterilir. Kaynağı değiştiren gezinme/hazırlama eyleminden sonra eski kaynağın devamı kullanılamaz: yeni bağlamda soru sorulmalıdır. Bu kapsamlar için otomatik sahiplik taşıması veya tahmini iş eşlemesi yapılmadı.

İptal, bekleyen renderer çağrısına kimlikli iptal işareti taşır; adaptörler uzun beklemelerden sonra bu işareti ve kaynak sahipliğini kontrol eder. Önceden gerçekten başlamış medya işi ayrı bir iştir, İşler üzerinden durdurulur. Bir kaydetme başladıktan sonra iptal etmek geçmişteki kaydetmeyi geri almış sayılmaz. Devam sonuçları sınırlanır, dosya/anahtar/endpoint alanları ayıklanır; model talimatı değil güvenilmeyen veri olarak verilir. Token/model ayarı araca açılmadı.

## Doğrulanan kusurlar ve değişen dosyalar

- `src/assistant-flows.js`: yukarıdaki sonuç/iş sahipliği, süre/sayı sınırı, tekrar engeli ve sınırlı kanıt katmanı.
- `src/assistant-agent-service.js`: devam doğrulaması, özgün kullanıcı hedefi, seri uygulama, exact iptal, eski kardeş kartları geçersiz kılma ve güncel yardım sınırları. Önceki ayrı uygulama çağrıları için aktif uygulama kilidi yoktu; aynı anda ikinci uygulama artık reddedilir.
- `src/assistant-provider.js`: main'in gerçek sonuçlarıyla yeni model turu; kabulü tamamlanma sanmama ve sonraki işlemi yalnız önerme sözleşmesi.
- `src/main.js`: transcription/dub dış iş kimliği ile ledger kimliğinin sınırlı eşlemesi.
- `src/renderer/renderer.js`, `media-workflows-ui.js`: mevcut backend kabul kimliğini adaptör sonucuna taşıma; tek bölüm/tek aralık koşulu.
- `src/renderer/assistant-app-actions.js`, `assistant-caption-actions.js`, `assistant-voice-actions.js`, `assistant-book-actions.js`, `assistant-library-actions.js`: iptal işaretinin alan adaptörlerine taşınması, gerçek başlatma kimlikleri.
- `src/renderer/assistant-agent-ui.js`: devam/uygulama durumu, yeni soruyla eski devamı karıştırmama, kaynak değişimi ve kapanışta bekleyen uygulamayı iptal etme, desteklenmeyen devamı dürüstçe açıklama.
- `src/renderer/assistant-workspace.js`: son yanıta devam, eylem ve kanıtları koruma; kanıtları ID ile tekilleştirme.
- `src/renderer/global-assistant.js`: ortak baloncukta devam komutu ve kitap/kütüphane bağlamına uygun kısayollar.
- `src/assistant-overlay.js`, `src/renderer/assistant-overlay.js`, `assistant-overlay.css`: güvenli native snapshot/komut sözleşmesi, devam düğmesi ve mevcut amber tema. İlk Windows denemesi native snapshot'ın yeni devam alanlarını düşürdüğünü ortaya çıkardı; eklendi. İkinci inceleme, mesaj render anahtarında busy bulunmadığından işlem bittiğinde kart düğmelerinin pasif kalabildiğini gösterdi; render anahtarı busy değişimini artık izliyor. Bunlar yeni akışın teslim öncesi yakalanan entegrasyon kusurlarıdır.
- `tests/assistant-flows.test.js`, `assistant-agent-service.test.js`, `assistant-overlay.test.js`, `electron-assistant-flows.smoke.js`: ilgili davranış/yarış/native kabul kanıtı.

## Kontroller ve gerçek sınırlar

**Geçti:** 13 hedefli test dosyası: `assistant-flows` (5), `assistant-agent-service` (12), `assistant-provider`, `assistant-overlay`, `assistant-app-actions`, `assistant-caption-actions`, `assistant-voice-actions`, `assistant-book-actions`, `assistant-library-actions`, `assistant-capabilities`, `ipc-parity`, `preload-usage-ratchet`, `coverage-map`. Komut biçimi `node tests/<ad>.test.js`. Değişen 20 JS dosyasında `node --check`, `git diff --check` geçti.

**Gerçek Windows Electron, ayrı profiller:** `electron-assistant-flows.smoke.js` gerçek ayar kaydetmesi, main/renderer/native baloncuk ve yerel HTTP sağlayıcıyla iki uygulanan adımı sınadı. Dört sağlayıcı isteği, toplam iki mesaj; devam tuşu native Enter keyDown/char/keyUp ile çalıştı. Uygulama sonrası kendiliğinden yeni model turu veya sonraki ayar değişikliği olmadı. TR koyu ve EN açık/720×680 ana pencere görüntüleri incelendi; form görünür, panel taşmıyor. Dar yüksekliğin yatay kaydırılan kısayol satırı korunur. Eski Türkçe sohbet içeriği locale değişince yeniden çevrilmez.

P04–P07 `electron-assistant-captions.smoke.js`, `electron-assistant-voice.smoke.js`, `electron-assistant-books.smoke.js`, `electron-assistant-library.smoke.js` yeniden geçti. Bunlarda gerçek renderer/PDF/ayar/katalog akışı, kontrollü medya/probe/kabul/yorum yanıtları kullanılır. Ham log/profil/görüntüler `.uiprev/` ve `tmp/` altında Git dışıdır.

**Koşulmadı/iddia edilmiyor:** tam `npm test`, uzun CI sonucu, normal `start.bat` açılışı, gerçek YouTube/Letterboxd/ücretli sağlayıcı, model seçme başarımı, GPU ve ses kalitesi. `start.bat`, `install.bat`, Python/CUDA yolu değişmedi. Yeni kod gerçek sesin insansı olduğunu kanıtlamaz. CI açık kalır ve teslimi bekletmez.

P01–P08 planının bu sürüm kapsamı tamamdır; uygulamanın her ayarı/arbitrary dosya erişimi veya bütün internet için otonom kontrol tamamlandı iddiası yoktur. Kaynak bazlı 54 kayıtlı araç korunur; hepsi aynı anda modele verilmez. Ücretli ve gerçek kullanım kabulü ayrı değerlendirmedir.
