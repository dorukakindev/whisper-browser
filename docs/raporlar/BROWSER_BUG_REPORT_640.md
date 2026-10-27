# Rapor 640 — Asistan aralığı ve pencere kabulü

Başlangıç `d6d46114259013c0b621017d2be654f40fed8ceb`. İki doğrulanmış ürün hatası:

1. `start_whisper` açık başlangıç/bitişi `player.browserWhisperRange` üzerine yazıyordu. `AssistantContextManifest.same` bu aralığı sahiplik kimliğinin parçası saydığı için kart kendi sahibini geçersiz kılıyor, devam kartı tutulamayabiliyordu. İstenen aralık artık mevcut `clipRange` parametresiyle yalnız işe aktarılır; genel sayfa tercihi değişmez. Kullanıcı daha sonra gerçekten kapsamı değiştirirse iptal koruması sürer.
2. `open_voice_preparation`, `MediaExperience.openVoice()` false dönse bile completed bildiriyordu. Sonuç artık hem güncel kaynak/sohbet/deadline hem gerçek `dubGeneratorDialog.open` ile doğrulanır. Pencere açılamazsa EN/TR hata döner; üretim başlamaz.

## Kanıt

- `assistant-app-actions.test.js`: iki yeni regresyon önce kırmızı, sonra yeşil; hata halinde pencere başarısı uydurulmaması, farklı işe aralık aktarımı ve sonraki insan kapsam değişimi.
- App actions + capabilities + flows + agent service: 41/41 geçti; schema, kaynak sahipliği, proposal, continuation ve iptal kontrolleri korunur.
- `electron-assistant-captions.smoke.js`: mevcut gerçek Windows main/preload/renderer/overlay kabulü genişletildi. 3 fixture sağlayıcı isteği, 1 kontrollü caption indirme, iki kontrollü ses başlangıcı; mevcut caption→speech-translation zinciri korundu. Gerçek Whisper adapterine 5–25 saniye aktarılırken kayıtlı 0–60 ve proposal sahibi korundu. Ses penceresi gerçekten açıkken completed alındı.
- Native exit0: `.uiprev/assistant-captions/1793087386734-13072`; dark caption kartı görüntüsü gözle incelendi. İlk iki native deneme, yeni testin enjekte edilen scriptindeki fazla parantez yüzünden başarısızdı; test düzeltildi, ürün hatası olarak sayılmadı.
- JS syntax ve diff kontrolü geçti. Yeni bağımlılık yok; genel ayarlar/kalıcı şema/start.bat değişmedi. Gerçek GPU/Whisper/model/YouTube veya işitsel kalite bu kontrollü akışta doğrulanmaz; CI beklenmez.
