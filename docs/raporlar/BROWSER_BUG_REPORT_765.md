# Rapor 765 — Hazır dublajın altyazı ve aralık kanıtı

Başlangıç master `922d7c66f858a45bd8caa11264000a2409c639dc`; ürün/test bitişi `102b32a47ed06dc61d900e642a90da685fb2fb32`.

## Doğrulanan sorun

Aynı videonun hazır sesi yalnız kaynak kimliğiyle aranıyordu. Kullanıcı farklı bir SRT veya klip seçmiş olsa da eski ses dönebiliyor, kayıtlı aralık seçilen aralığın üstüne yazılabiliyordu. Aynı medya içinde bekleyen lookup sırasında SRT/aralık değişimi de kontrol edilmiyordu. R764'ün açık SRT aktarımı bu mevcut boşluğun önemini artırdı.

## Uygulama

- `src/dub-service.js`: üretimde alınan SRT baytlarının SHA256 özeti iş kaydında `subtitleHash` alanıyla saklanır. `dub:latest` isteğinde SRT varsa mevcut yetkilendirme kapısından geçer; 4MB sınırıyla hash hesaplanır. Otomatik sonuç aynı kaynak, aynı SRT içeriği ve tam aralık eşleşmesini gerektirir; örnek kayıtlar elenir. Eski hash'siz kayıt otomatik seçilmez. Sadece açık id ile istenen eski sonuç yolu korunur. Dosyalar silinmez, altyazı metni hash alanına/loga eklenmez.
- `src/renderer/dub-generator-ui.js`: lookup SRT/aralığı taşır. Yanıt beklerken seçim değişmişse sonuç reddedilir. Açık SRT'nin aralığı kayıtlı ses tarafından değiştirilmez. SRT yokken önceki açık geri yükleme davranışı korunur.
- `tests/dub-service.test.js`: gerçek kayıt/hash, aynı yol değişen içerik, farklı/tam aralık, eski kanıtsız kayıt, örnek ve açık-id erişimi kontrolleri.
- `tests/dub-current-subtitle764.test.js`: gerçek DOM lookup scope ve aralık değişirken geç sonuç kontrolü.
- `tests/electron-dub-source764.smoke.js`: mevcut Windows kabulüne IPC scope ve geç lookup/aralık kontrolü eklendi; yeni kopya test düzeneği oluşturulmadı.

## Kanıt ve sınırlar

17 hedefli Node testi PASS; `node tests/dub-service.test.js`, `node tests/dub-source-restore-ui.test.js`, `node tests/dub-generator-ui.test.js` ayrı çalıştı ve geçti. Ürün JS syntax ve diff kontrolleri geçti. Windows native Electron exit0: `scopeChecked:true`, `changedClipRejectsLateResult:true`; yerel kanıt `.uiprev/dub-source764-1793258859479/acceptance.json`. Gerçek renderer/preload/IPC, ayrı profil; kaynak/config/lookup kontrollü. Mevcut ekran düzeni korunur, CSS veya yeni UI kontrolü eklenmedi. Canlı YouTube/GPU/kişisel start.bat/full suite koşulmadı. Mevcut 11 before-quit listener uyarısı açık; bastırılmadı. CI beklenmedi.

Mevcut SHA256 plan doğrulaması ve scoped sourceIdentity yaklaşımı genişletildi; yeni harici kod/bağımlılık yok. Electron MIT dosya seçici sözleşmesi R764'te incelenmişti, tekrar kopyalanmadı. Yerel iş JSON'una isteğe bağlı hash alanı eklenir; göç veya eski dosya silme yok. P003/P005/P010/P079 kısmi ilerleme; tüm kaynak ve kalite kabulü iddiası yok. Müzik kapsam dışı, 90 aktif hedef sürüyor.
