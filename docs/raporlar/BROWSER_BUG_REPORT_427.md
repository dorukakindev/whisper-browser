# 427 — Browser Whisper + çeviri için zaman aralığı seçimi

Kullanıcı, Altyazı menüsündeki Whisper + çeviri eyleminin yanında ayar düğmesi ve başlangıç/bitiş seçimi istedi. Önceki browser yolu ana ekranın clip alanlarını sıfırlıyor, progressiveRanges ile tüm videoyu işliyor ve hazır tam-video kaynak/çeviri izini seçimi sorgulamadan tekrar kullanıyordu. Bu bir eksik özellikti.

## Uygulama

- Eylemin yanında erişilebilir etiketli ayar simgesi bulunur. Yönetilen modal, odak/ESC ve browser yüzeyi kapatma altyapısını kullanır.
- Yalnız seçilen zaman aralığını işle kutusu + Başlangıç/Bitiş (dk:sn). Örnek 0:00 → 10:00. Uygula işi başlatmaz; ardından Whisper + çeviri seçilir. Kutuyu kapatmak tam-video davranışını geri getirir.
- Seçim kanonik YouTube video URL'siyle oturum içinde tutulur; başka videoya geçince uygulanmaz, uygulama yeniden açılınca varsayılan tüm videodur. Yalnız kaynak Whisper eylemi de aynı aralığı kullanır.
- Aralık mevcut startProgressiveChunk → startTranscribeSafe clipStart/clipEnd yoluna gider; aynı iş translate=true taşır. Backend'in mevcut kırpma ve orijinal zaman eksenine offset yolu korunur; ikinci çeviri işi veya yeni IPC eklenmedi.
- Seçili aralıkta hazır tam-video dosyası tekrar kullanılarak seçim atlanmaz. Aralık çıktıları generatedBy=whisper-range taşır; aralık kapatılınca tam-video çıktısı sanılıp tekrar kullanılmaz.
- Boş/geçersiz/ters aralık reddedilir. Bilinen video süresi aşılırsa hata gösterilir. Reklam oynarken reklam süresi asıl video süresi sanılmaz. Diyalog açıkken başka videoya geçilmişse Uygula reddedilir.
- EN/TR, amber tasarım ve mevcut CSP korunur. Yeni bağımlılık/kalıcı ayar şeması yok.

## Doğrulama ve sınırlar

Windows node --test --test-isolation=none: browser-youtube-whisper, browser-menu-proxy, settings-ui-persist-roundtrip, ui-locale, dom-innerhtml-ratchet geçti. Regresyon 120–600 saniyeyi üretim startProgressiveChunk fonksiyonundan gerçek başlatma sınırına kadar takip eder; translate=true ve kaynak koruma açık; hazır kaynak atlatması ve kısmi çıktı kimliği kontrol edilir. Model/sağlayıcı kontrollüdür, gerçek ücretli çeviri veya GPU işi değildir. İlk locale kontrolü yeni sayısal placeholder'ı saptadı; gereksiz placeholder kaldırıldı, test gevşetilmedi. Sekiz DOM-ratchet kaydı yalnız +2 satır kaydırıldı.

Gerçek Windows Electron/src/main.js, ayrı anonim test profili: YouTube sayfasında ayar düğmesine fare ile tıklama, modal açılması, kutu/uygula ve 2:00–10:00 kaydı geçti. Ters aralık reddi ve diğer videoda sıfırlama geçti. Menü ve modal görüntüsü incelendi; tmp/whisper-range-* kanıtları Git dışında. İlk boş-sekme harness'ı görünmeyen menüyü hedefledi; gerçek video sayfasında tekrarlandı. Anonim test profilinde reklam koruması bilerek kapalıydı; bu görev reklam başarısı testi değildir. Bazı capturePage çağrıları önceki boyanmış kareyi döndürdü; DOM durumu ve önceki gerçek modal görüntüsü ayrıca kontrol edildi.

JS syntax/diff check temiz. Tam npm test, yeni start.bat açılışı, canlı Whisper/CUDA ve ücretli sağlayıcı uçtan uca üretimi yapılmadı. Mevcut backend kırpma/offset uygulanması değişmedi; yeni test gerçek model kalitesi veya çıktı dosyası üretimi kanıtı sayılmaz. Kullanıcı talimatıyla CI beklenmez.
