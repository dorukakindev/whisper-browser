# Rapor738 — Metin stüdyosunda iş sahipliği ve durdurma durumu

## Gerçek hata
Başlangıç IPC yanıtı beklenirken renderer `pending` durumunda gelen herhangi bir `kind:text` olayını kendi işi sayıyordu. Gerçek Windows izole stüdyoda eski işe ait progress/status/log/error/cancelled/done dizisi verildi: yeni işin Motor hazırlanıyor durumu, eski işin STALE ERROR mesajıyla başarısız oldu. [Başlangıç kanıtı](evidence738/before.txt). Bu önceki R722/R732 tasarım veya R737 kitap etiketi işi değildir.

## Uygulama
- `src/renderer/text-voice-studio.js`: istekten önce `text-UUID` oluşturulur; olay, başlatma yanıtı ve durdurma yanıtı yalnız hâlâ aynı etkin kimliğe aitse uygulanır. Eski iş sonraki isteği sonlandıramaz veya onun hata durumunu değiştiremez. İptal sürerken ilerleme/model olayları Durduruluyor durumunu değiştirmez; tekrar Durdur kapalı kalır. Terminal veya gerçek iptal hatasında durum doğru açılır.
- `src/text-voice-studio.js`: isteğe bağlı, biçimi doğrulanmış istemci kimliği kabul edilir. Eski çağıranlarda sunucu UUID üretmeye devam eder. Aynı girdi klasörü kimliği yeniden kullanılarak önceki istek/çıktının ezilmesi reddedilir.
- `src/preload.js`: mevcut cancelDub API'sine isteğe bağlı kimlik nesnesi aktarımı. Yeni IPC kanalı yok.
- `src/dub-service.js`: kimlikli iptal yalnız aynı iş ve göndericiyle eşleşirse uygulanır; eskimiş kimlik no-op/stale döner. Mevcut kimliksiz iptal ve kapanış yolu korunur.
- `tests/text-voice-studio.test.js`: istemci kimliği, geçersiz kimlik, eski iptalin yeni işi durduramaması, gerçek eşleşen iptal ve kimlik tekrarının reddi.
- `tests/electron-text-voice.smoke.js --event-ownership`: geciktirilmiş iki başlangıç ve bir iptal yanıtı, eski altı olay türü, geç hata yanıtlarının sonraki işe etkisizliği, güncel iş hatasının görünürlüğü ve iptal durumunun korunumu. Test modunda başlangıç/iptal işlemleri kontrollü; renderer/preload/IPC ve görüntü gerçek Windows Electron.

## Doğrulama
- Ana koda karşı önce exit1: eski olay gerçekten durumu bozdu. İlk kimlik yokluğu kontrolünden sonra doğrudan yanlış kullanıcı durumunu kanıtlayan assertion eklendi.
- Final native exit0: iki başlangıç/bir durdurma; önceki olaylar reddedildi, güncel hata gösterildi, EN/TR dönüşünde korundu. Gerçek GPU/model çalıştırılmadı.
- `node --test --test-isolation=none tests/text-voice-studio.test.js tests/dub-service.test.js tests/dub-service-warm-start.test.js tests/preload-sandbox.test.js`: 5 PASS,0 skip. Sonuç dosyası servis testinin asenkron başarı mesajıyla da doğrulandı.
- Değişen JS syntax ve `git diff --check`: PASS.
- [EN güncel hata](evidence738/studio-owned-error-en.png) ve [TR 480 CSS px / %125](evidence738/studio-tr-narrow-125.png) açılarak incelendi; ortak tema korundu, yatay taşma yok, ana eylemler 44px. [Ölçüm](evidence738/acceptance.json). Yeni kozmetik tasarım bu turda yapılmadı; mevcut R732 düzeni tekrar sayılmaz.
- Test eklerken tek Türkçe regex literalinin CP1254 yazılması native beklentiyi bozdu; test bytes UTF-8 doğrulaması ve Unicode escape ile onarıldı. Assertion/eşik kaldırılmadı. Ürün dosyaları UTF-8 doğrulandı.

## Yaklaşım ve sınırlar
Mevcut dublajın iş kimliği/tek sahipli iptal kalıbı kullanıldı. [Electron ipcMain resmî sözleşmesi](https://www.electronjs.org/docs/latest/api/ipc-main) async invoke yanıtı ile bağımsız gönderilen olayların uygulama tarafından eşleştirilmesi gerektiği mimari bağlamında incelendi; harici repo kodu/bağımlılık alınmadı. Yeni dosya şeması yok; mevcut istek kimliği artık renderer ile ortak.

Yeni gerçek GPU/TTS, API, donanım dinleme, tüm iptal aşamaları veya start.bat etkileşimli kabulü yapılmadı. Tam npm/CI sonucu beklenmedi; CI açık. Mevcut 11 before-quit listener uyarısı ve testte bilerek kapalı dış ağ filtre uyarısı kaydedildi. Kişisel uygulama/profil değiştirilmedi. P006/P008/P046/P047/P097 kısmi ilerleme; diğer akışlar ve 90 hedef açık. Müzik işi eklenmedi.
