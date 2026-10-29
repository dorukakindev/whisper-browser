# Rapor792 — Dış UI denetiminin doğrulanması

Başlangıç master `400d4137e9d102e0786b0f747ee15c10842bc117`; dal `codex/ui-audit792`; bitiş ürün/test kodu `e04f43e9c3d991a75cbd4201015f5d2ce67a82ce`. Kaynak paketlerin numaraları bağımsız denetimlere aittir; depodaki R790/R791 belgeleri üzerine yazılmadı.

## Kaynaklar

- whisper-browser-ui-audit-reports-789-791.zip: `18211f132fc99d5e8d8e22546a12af98a32bb06fc7fef43d82fec70e44e90dd3`
- ui-audit-reports.zip: `d517a910078d5d36bee09cbb547f1e87a50d96e5c04087f8d51de9c3ce5a35d3`

İlk arşivin merkezi dizinindeki bir yerel header ofseti geçersizdi. R791 metni doğru local header'dan bulundu, sıkıştırma açıldı ve merkezi dizindeki beklenen boyut+CRC32 eşitliği doğrulandı. Arşivdeki metinler talimat kabul edilmedi. İkinci arşivde yinelenen R788/R789 bulguları önceki R790 onarımlarına referans sayıldı; yeni bug diye sayılmadı. Kişisel ekran görüntüleri veya ham arşiv Git'e eklenmedi.

## Doğrulama ve kararlar

| Dış ID | Güncel sonuç |
|---|---|
| UI-790-01 | Ortak sözlükte Uygulama ayarları eksikliği yeniden üretildi. Sözlük anahtarı eklendi; mevcut runtime kancası korundu. Windows EN/TR title ve aria-label kabulü geçti. |
| UI-790-02 | Pasif ana CTA hazır eylem gibi görünüyordu. Pasif durumda nötr tema yüzeyi, okunur metin ve gölge yok; eksik SRT/ses açıklaması aria-describedby ile bağlı. Hazır işte açıklama gizlenir; başlatma kapısı korunur. |
| UI-791-01 | Denetim kapsamı sınırlı; gerçek kodda12preparer ve dar görünüm atlama kuralı vardı. Atlanan yüzeyleri gizlemeyen statik envanter/kapsam raporu ve isteğe bağlı coverage-strict kapısı eklendi. Tüm87yüzeyin otomatik gezildiği iddia edilmiyor. |
| UI-791-02 | Asistan ses testindeki3hata eski fixture'ın browserTracks taşımamasından yeniden üretildi. Fixture güncel sahiplik sözleşmesine taşındı. BrowserTracks yokken eski player altyazısı benimsenmez ve iş başlatılamaz negatif kontrolü eklendi. Ürün güvenlik kapısı gevşetilmedi. |

Son sözlük testinde önceki yeni DeepSeek model kimliği nötr metin listesinde yoktu; model ID'si çevrilmeyecek teknik ad olarak eklendi. Kullanıcı metnini nötr sayan genel kaçış eklenmedi.

## Dosyalar ve kullanım

- src/renderer/ui-locale.js: ortak uygulama ayarları etiketi.
- src/renderer/index.html, dub-generator-ui.js, browser-chrome.css: üretim düğmesi açıklaması ve pasif nötr durum. Çalışan/kilitli işte ek önkoşul açıklaması gösterilmez; mevcut ilerleme durumu kullanılır.
- tests/assistant-voice-actions.test.js: güncel browser track fixture'ı ve sahipsiz altyazı negatif testi.
- tests/dub-generator-ui.test.js: eksik/hazır koşullarda düğme ve açıklama kabulü.
- tests/ui-locale.test.js: DeepSeek teknik model ID nötr girdisi.
- tools/ui-surface-coverage.cjs: index, assistant-overlay ve browser-mini belgelerindeki ID'li details/section/dialog/aside/role-dialog/data-ui-surface kökleri; ayrı belge kökleri dahil. Güncel statik envanter87kök; eski rapordaki68ile farklı kapsam/revizyondur,87bağımsız tam akış iddiası değildir.
- tools/audit-ui.mjs: her seçili preparer artık her istenen genişlikte çalışır. Görünmeyen scope BLOCKED olur, boş kontrast sonucu başarı sayılmaz. Ekran görüntüsüne bağlı görünür köklerin gerçek locale/theme/width kanıtları report.json ve coverage.json'a yazılır. Ayrı overlay penceresi ve işaretlenmemiş dinamik dialoglar örtük kapsanmış sayılmaz.
- `node tools/audit-ui.mjs --inventory-only --out tmp/ui-inventory`: tarayıcı gerektirmeden açık envanter;0ziyaret. `--coverage-strict` eklenirse eksik kökler için exit1. Mevcut `--strict` kontrast kapısı ayrı kalır. Tarayıcı yoksa exit2ile birlikte BLOCKED kapsam dosyası yazılır.
- tests/ui-surface-coverage792.test.js: asistan ayrı dokümanı dahil, screenshot olmayan kayıt ziyaret sayılmaz.
- tests/electron-ui-audit792.smoke.js: gerçek Windows pasif durum/renk, açıklama ve ayarlar etiketi kabulü.
- tools/UI-SURFACE-COVERAGE.md: kapsam ve komutların sınırları.

## Kanıtlar

- İlk hedefli testte sözlük ve3asistanfixture hatası yeniden üretildi. Son `node --test tests/ui-locale.test.js tests/assistant-voice-actions.test.js tests/dub-generator-ui.test.js tests/ui-surface-coverage792.test.js`:8alt-test PASS. Tüm180asistan testinin bu turda geçtiği iddia edilmez.
- Windows Electron TRkoyu1440/ENaçık800,4görüntü: native disabled, açıklama bağı, RGB nötr yüzey eşitliği, modal/altçubuk/yataytaşma, sideAppSettings title/aria-label PASS. Son kanıt `.uiprev/dub-layout792-1793310126743`. İlk renk ölçümü CSS geçişi bitmeden yapıldığı için amber ara rengi okudu; animasyon tamamlandıktan sonraki durum yeniden ölçüldü. Test eşiği gevşetilmedi. Görüntü elle incelendi.
- Gerçek Chrome/Edge bulunarak audit çalıştı. Dublaj × TR/EN × dark/light ×800/1400:8capture,0kontrast ihlali (`tmp/792-browser-audit`). Görünmeyen scope filtresi eklenmiş son sürüm800px4capture,0kontrast ihlali (`tmp/792-browser-final`). Bu çalıştırma1/87kökü kapsadı;86UNVISITED açıkça yazıldı.
- Inventory-only strict:87declared/0visited/87unvisited, beklenen exit1. Normal inventory-only exit0 bir görsel başarı sayılmaz.
- JS syntax ve git diff--check PASS. Gerçek Electron mevcut MaxListenersExceededWarning ve izole ağ filtre hazırlama uyarısı gizlenmedi.

## Açık kapsam

Bütün87köke gerçek preparer, dinamikdialogdata-ui-surface sözleşmeleri ve ayrı asistan native capture'ını tek runner'a bağlama bu turda tamamlanmadı; kapsam dosyası bu boşluğu görünür kılar. Yeni tüm-sayfa/animasyon kalite garantisi yok. GPU/YouTube/start.bat/fullnpm/CI koşulmadı; CI açık beklenmiyor. Kullanıcının kişisel uygulaması kapatılmadı, ayarları değiştirilmedi. Yeni bağımlılık kurulmadı; mevcut jsdom ve native Electron/Chrome araçları kullanıldı. Tasarımda make-interfaces-feel-better ilkeleri mevcut CSS tema token'larıyla uygulandı; dış UI kodu kopyalanmadı. Müzik kapsamı genişletilmedi,90hedef aktif.
