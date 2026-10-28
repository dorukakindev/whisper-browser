# Rapor 695 — Asistan ayarlarında iki dil ve panel çevirisi doğrulaması

Başlangıç: `21efbbcd79e452736d37948a753668046e739de2`. Ürün commit'i: `ee4dcc005d5433caf6b25372431316b3911b825c`. Dal: `codex/locale-contract695`.

## Bulgular ve düzeltmeler
- Asistan sağlayıcısı/modeli, DeepInfra hizmet katmanı, anahtar ve Flex açıklaması statik İngilizceydi. Kanonik TR kaynak metinleri ile EN eşlemeleri eklendi; kontrol kimlikleri/değerleri değişmedi. Varsayılan arayüz İngilizce kalır.
- Kalite paneli kendi yerelleştiricisini kullandığından erişilebilir grup adı TR'ye dönmüyordu. Aynı üretim fonksiyonu artık aria-label değerini de günceller.
- Üç hata iletisinin İngilizce karşılığı eksikti: geçersiz altyazı aralığı, yetkili PDF'yi yeniden açma ve durdurmanın doğrulanamaması. Sözlük eşlemeleri tamamlandı.
- R694'te başlangıç master'da da yeniden üretilen iki test kırmızısı düzeltildi. Timeline/PDF arama/sahne panellerinin gerçek üretim yerelleştiricileri JSDOM üzerinde EN ve TR çalıştırılır; bu davranış doğrulanmadan metin kapsanmış sayılmaz. Eski bitişik-script regex'i yerine her bağımlılığın tek kez ve doğru sırada yüklenmesi denetlenir. Eksik metin eşiği artırılmadı, test silinmedi.

## Kanıt
- `node --test --test-isolation=none tests/i18n-coverage.test.js tests/ui-locale.test.js tests/ui-locale-dynamic.test.js tests/ui-locale-userdata.test.js tests/dialog-locale.test.js`: 5 dosya PASS, sıfır skip. Arayüz metin kapsamı 0/0 eksik. Kullanıcı altyazısı/başlığı çeviriye sokulmaz kontrolleri geçti.
- renderer.js, ui-locale.js ve native test sözdizimi kontrolleri, `git diff --check`: PASS.
- Gerçek Windows `electron-dub-runtime.smoke.js`: PASS. Üretim renderer/preload, EN→TR asistan başlıkları ve timeline aria-label doğrulandı; mevcut stüdyo ilerleme, önceki çıktı, referans arama, açık/koyu tema ve %100/%125 kontrolleri geçti. Motor olayları kontrollü fixture, gerçek GPU/model kalitesi testi değildir.
- İlk yeni native assertion bütün label'ın metnini seçtiğinden içindeki option metinleriyle eşleşmedi; seçici gerçek `.field-label` olarak düzeltildi ve tekrar geçildi. Ürün hatası olarak sayılmadı.
- Sanitized kanıt: `docs/raporlar/LOCALE695_2026-10-28/`. Test profili/kişisel ayar/anahtar yayımlanmadı.

## Kaynak, kapsam ve sınırlar
Electron'un güncel resmi [erişilebilirlik rehberi](https://www.electronjs.org/docs/latest/tutorial/accessibility) incelendi; HTML erişilebilirlik ağacındaki adları mevcut yerelleştirme sistemiyle güncelledik. Harici kod kopyası, yeni bağımlılık veya ikinci tasarım sistemi eklenmedi. Önceki görsel kontrol skill'inin mevcut CSS sistemi/tutarlılık yaklaşımı korundu.

11 `before-quit` dinleyicisi uyarısı açık; eşik yükseltilmedi. Tam npm test/CI, temiz start.bat kurulumu, GPU ve canlı sağlayıcı bu pakette koşulmadı. start.bat/install.bat, Windows yol/dosya seçici ve CUDA sözleşmeleri değişmedi. Native Electron testi start.bat açılışı sayılmaz. P092 yalnız bu yüzeyler için ilerledi; 100 maddelik hedef tamamlandı iddiası yok.
