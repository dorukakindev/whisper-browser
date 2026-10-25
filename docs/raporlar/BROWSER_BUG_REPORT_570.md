# Rapor 570 — Seçerek PDF metni hazırlama

P03, 25 Ekim 2026. Başlangıç `57bf855c8dffdd926f816415ceb8cf7cf5c26077`; ürün bitiş `c5777ab4cd967c29ece8a8ba112c64d734c6f7a4`. PR487 / `codex/book-reliability549`. Yeni ürün özelliği; var olmayan bir bug sayısı üretilmez.

## Kullanım ve kapsam

PDF üretim projesinin bölüm düzenleyicisinde **Seslendirme için metni hazırla → Önerileri önizle** açılır. Satır sonunda tireyle bölünmüş küçük harfli sözcük adayları ve sözcük içi yumuşak tireler gösterilir. Her öneri başlangıçta **Özgün metni koru** durumundadır. Kullanıcı sözcüğü birleştirmeyi veya normal tireyi koruyup satır sonunu kaldırmayı ayrı ayrı seçer. Önce/sonra karşılaştırması seçime göre değişir. Uygulama yalnız editör taslağını değiştirir; mevcut **Metni kaydet** ile kalıcı olur. Hazırlamayı geri al, sonraki manuel düzenlemenin üzerine yazmaz.

Büyük harfle başlayan sözcükler, kısaltmalar, sayısal aralıklar, satır içi tireler ve boş satırla ayrılmış paragraflar otomatik öneri yapılmaz. Bu bir sözlük veya anlamsal doğrulama değildir: küçük harfle yazılmış özel ad/gerçek bileşik sözcük ayrımını kesin yapamaz. Bu nedenle varsayılanı seçimsizdir ve tireyi koruma seçeneği vardır. Kaynak PDF değişmez. Ses üretimi/AI çağrısı kendiliğinden başlamaz.

Önizleme anındaki metin snapshot'ı değişmişse uygulama reddedilir; yeni öneri gerekir. En çok 100.000 karakter ve 200 öneri; daha fazla aday varsa açık sınırlama mesajı. PDF'nin satır sınırı metne aktarılmadıysa aday uydurulmaz. Özgün PDF vurgusunun hazırlanan sözcükle eşleşmemesi durumunda önceki kesin-eşleşme politikası korunur; tahmini kutu çizilmez.

## Dosyalar

- `src/book-text-preparation.js`: saf, yerel UMD model; Unicode adayları, sınır, snapshot, seçili değişiklikleri ters ofset sırasıyla uygulama.
- `src/renderer/book-text-preparation-ui.js`: EN/TR önizleme, açık seçim, taslak uygulama/geri alma.
- `src/renderer/media-workflows-ui.js`: yalnız PDF bölüm editörüne, güncel bölüm/diyalog kontrolüyle bağlama.
- `src/renderer/index.html`, `media-workflows.css`: CSP uyumlu yerel script ve mevcut tema tokenlarıyla sınırlı kaydırmalı panel.
- `tests/book-text-preparation.test.js`: seçim, korunan metinler, Unicode, bayat snapshot, sınırlama.
- `tests/electron-book-reliability.smoke.js`: gerçek düğme/seçim/kaydet/geri al ve PDF değişmezliği.

## Doğrulama

`node --test tests/book-text-preparation.test.js tests/csp-policy.test.js`: 8 PASS. Syntax ve diff kontrolü temiz. Ayrı profilde Windows Electron `.uiprev/book-reliability549-1792920999543`, exit0. İki adayın hiçbiri kendiliğinden seçilmedi; birinci birleştirildi, ikinci ve büyük harf/sayı örnekleri korundu; sonradan düzenleme apply'ı kilitledi; gerçek UI kaydetme ve geri alma geçti. Test kaynak PDF SHA256 önce/sonra eşit. Ekran görüntüsü incelendi. Önceki kitap yer imi/PDF/EPUB/M4B smoke adımları da geçti.

Native sonrasında yalnız yumuşak tire/boş sonuç etiketleri EN/TR açısından netleştirildi; syntax/diff kontrolü tekrarlandı. Tam paket/CI, kişisel start.bat, gerçek GPU/TTS/live API denenmedi. Yeni bağımlılık, IPC, kalıcı şema veya kurulum değişikliği yok. P03 tamam; P04–P10 açık. Master merge yapılmadı.
