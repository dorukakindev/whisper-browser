# Rapor803 — Ürün50 ilk paket: dublaj inceleme ve referans durumu

Başlangıç `e24e1b397211b52fd2f0ae48b4da24fed56b7bd3`; ürün bitişi `31116aa59d8dc6bc71aab06485338888d2b6e563`. Dal `codex/product50-review803`. [Ürün50 listesi](PRODUCT50_2026-10-30.md): P01–P10 incelendi. **7 hedefte ürün geliştirildi;3 mevcut davranış korundu.10yeni bug denmiyor. Kalan40 adaydır.**

## Değişiklikler

- P01: kalite listesinde Tümü/İnceleme/Üretilemedi/Hazır sayılı filtreler. Kaynak değişince reset; aynı işte yeniden açmada seçim korunur. Boş filtre için açık seçenek; boş grupta dinleme/yeniden üretim kilitli.
- P02: önceki/sonraki sorunlu grup ve Alt+↑/↓. Yalnız açık dublaj penceresi, tek tetik, form/contenteditable dışında, boş/busy korumalı. Filtre dışı sorunlu gruba giderse Tümü görünümüne döner.
- P03: mevcut kısa EN/TR hata etiketlerine ilk5 sayı/ad değeri eklendi. Metin `textContent` ile yazılır; bilinmeyen ASR işaretleri otomatik doğruluk sayılmaz.
- P04: kalite grubu ve plan eşleşmesi korunur. Artık yalnız listede gezinmek düzenleyiciyi açıp sayfayı başka yere kaydırmaz. **Metni düzenle** açık eylemi aynı grubu açar. Ctrl+Alt+R onarım yolu düzenleyiciyi açmaya devam eder.
- P05: Apply/Reset event handler'ları üretim, planlama, dosya/referans veya workspace işlemi sırasında yazmayı reddeder. Sadece disabled görünümüne güvenilmez.
- P07/P08: referansta seçili ile etkin ses ayrılır. **Seçildi, uygulanmadı**, **Bu referans etkin**, **Döküm değişiklikleri henüz uygulanmadı** durumları; başarılı gerçek kullanımda etkin ID/metin güncellenir. Var olan orijinal döküm diff'i korunur. Geç gelen liste koruması değişmez.
- P06 A/B dinleme mevcut, P09 paralel süre açıklaması mevcut, P10 kalite sayacı/alt inceleme eylemi mevcut: eski işleri yeni teslim diye saymak için yeniden yazılmadı. P09'un gerçek süre kanıtı R802'de bulunur. Kaynak incelemesi tarihsel kanıtın yerine yeni model başarısı diye sunulmadı.

## Kontroller

- Node: `node --test --test-reporter=spec tests/dub-generator-ui.test.js tests/assistant-voice-actions.test.js tests/voice-reference-ui.test.js tests/voice-reference-compare.test.js`: **10 geçti**.
- İlk test kalite seçiminde otomatik editör açılmasını bekliyordu. Kasıtlı UX değişikliği nedeniyle kırmızı oldu; test şimdi önce liste seçiminin kapalı editörü açmadığını, sonra açık **Metni düzenle** eyleminin doğru editörü açtığını birlikte doğrular. Test silinmedi, başarı eşiği düşürülmedi.
- Native: `tests/electron-dub-experience795.smoke.js --experience801 --review803`: **12 PNG**; üç filtrede doğru tek seçenek, sorunlu önce/sonra döngüsü, formda kısayol reddi, aktif üretimde programatik Apply/Reset'in yazamaması, sayının hata ayrıntısında görünmesi, doğru grubun onarımı geçti. 1440 TR koyu ve900px +%125 EN açık. Önceki/sonraki hizası ilk görüntüde dağınıktı; aynı satıra alınıp yeniden çekildi ve son koyu görünüm gözle incelendi.
- Değişen5JS syntax ve diff kontrolü geçti. GPU/ücretli API bu pakette yeniden kullanılmadı; R802 sonuçları yeni test diye sayılmadı. Tam npm/uzun CI beklenmedi. Önceden var olan11before-quit listener uyarısı ve izole filtre ağı reddi görünür.

## Dosyalar ve sınırlar

`dub-generator-ui.js`: filtre/navigasyon, güvenli seçme/düzenleme ve neden değerleri. `voice-reference-ui.js`: etkin ID/metin ve taslak durumu. `media-experience.css`: filtre/önce-sonra/status ortak tema aralıkları. Üç mevcut test davranış/kullanım sözleşmesini doğrular. Yeni bağımlılık/IPC/model/ayar dosyası yok; filtre ve referans geri bildirimi oturum içidir. Gerçek kişisel katalog bu kontrollü UI testine katılmadı; kişisel ayarlar/dosyalar korunur. Windows start.bat değiştirilmedi veya yeniden açılmadı. [Sentetik görüntü manifesti](evidence803/manifest.json).
