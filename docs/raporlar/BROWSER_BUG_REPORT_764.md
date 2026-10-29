# Rapor 764 — Dublaj girişlerinde açık altyazıyı yeniden seçtirmeme

Başlangıç master: `7d0f5c488a26d558b049161a5087a96b4c92ab63`. Ürün/test bitişi: `69928251d545a0b2ccc7d453f456d5329f2c4b3a`.

## Doğrulanan eksik ve uygulama

`DubGeneratorUI.prepareCurrent` açık altyazıyı alırken normal browser/player düğmeleri yalnız `open()` çağırıyordu. Aynı kullanıcının aynı videosunda giriş noktasına göre yeniden SRT seçmesi gerekiyordu. Yeni ortak açılış, çeviri rolündeki ikinci SRT'yi; yoksa kaynak SRT'yi devralır. Dosyanın mutlak SRT yolu olması gerekir. Browser'da aktif sekmenin track listesinde bulunmayan artık yol reddedilir. Yapılandırma beklerken medya veya altyazı değişirse eski aday uygulanmaz. Kullanıcının elle seçtiği SRT, devam eden iş, planlama ve dosya seçici korunur. Ses üretimi otomatik başlamaz. Mevcut aralık aktarımı değişmez.

Değişen dosyalar: `src/renderer/dub-generator-ui.js` ortak hazırlık; `tests/dub-current-subtitle764.test.js` altı davranış kontrolü; `tests/electron-dub-source764.smoke.js` gerçek Windows renderer/preload/IPC kabulü.

## Kanıt

- `node --test --test-isolation=none tests/dub-current-subtitle764.test.js tests/dub-request-owner756.test.js tests/dub-shortening-draft763.test.js`: 15 PASS.
- `node tests/dub-generator-ui.test.js`: PASS; üretim/iptal davranışı korunur.
- Ürün ve native test JavaScript syntax kontrolleri, `git diff --check`: PASS.
- Windows Electron ayrı sentetik profil: exit 0; çeviri SRT ve 5:00–10:00 aralığı geldi; ilk açılışta sıfır dosya seçimi/sıfır üretim; elle seçilen SRT tekrar açılışta korundu. Gerçek ekran görüntüsü incelendi; ortak grafit/amber düzeni korunuyor, yeni kontrol/CSS yok.
- Yerel kanıt: `.uiprev/dub-source764-1793258265680/acceptance.json` ve `automatic-subtitle-tr.png`. Bu sentetik ekran kişisel veri içermez; ham profil Git'e alınmadı.

## Kaynak, sınırlar ve hedef

Mevcut `prepareCurrent`, `selectedSubtitleRange` ve track kayıt kodu esas alındı. Electron'un MIT kaynak deposundaki [dosya seçici sözleşmesi](https://github.com/electron/electron/blob/main/docs/api/dialog.md) incelendi; yeni bağımlılık veya dış kod kopyası gerekmedi. Yeni IPC/şema/kurulum değişikliği yok. Native kabulde kaynak bağlamı ve config kontrollüdür; gerçek YouTube, fiziksel dosya seçici, GPU/ses kalitesi ve kişisel start.bat oturumu bu tur doğrulanmadı. Bilinen 11 before-quit listener uyarısı sürüyor; bastırılmadı. CI beklenmedi. P002/P003/P071 ilerledi; bütün kaynaklarda tamamlandı iddiası yok. Müzik kapsam dışı; 90 aktif hedef sürer.
