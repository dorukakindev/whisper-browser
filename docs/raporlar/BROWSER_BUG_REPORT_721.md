# Rapor721 — Ses kimliğine bağlı ilk referans dökümü ve değişiklik karşılaştırması

Başlangıç `96a65cb6a5ecbfb6aa80d22c6cf2ceedf743443b`; ürün/test bitişi `062f3ead80bdbe26ea37b949ec521dd4b31ff711`; dal codex/reference-transcript721.

## Kullanıcıya getirilen özellik

Yeni referans hazırlanırken backend'in verdiği ilk otomatik döküm artık ayrı `reference-asr.json` dosyasında WAV SHA256 kimliğiyle saklanır. Kullanıcı dökümü düzeltse de bu ilk kayıt değişmez. Referans panelindeki açılır karşılaştırma, ilk metni ve düzenlenen metni kelime farklarıyla gösterir. “İlk dökümü düzenleyiciye getir” yalnız taslağı değiştirir; kaydetme/etkinleştirme hâlâ Bu sesi kullan eylemindedir.

Bu **ses/metin uyumunun kesin doğruluk puanı değildir**. Otomatik tanıma hata yapabilir. “Aynı” yalnız ilk otomatik metinle aynı olmak demektir; ekranda açıklanır. Eski kayıtta baseline yoksa veya WAV değişmişse karşılaştırma yok/kontrol edilmedi durumu gösterilir. Eski kişisel dosyalar topluca yeniden yazılmaz veya tanınmış sayılmaz. Yeni kaydı hazırlama ve uygulama akışları korunur.

## Kod ve veri

- `src/voice-reference-baseline.js`: bounded SHA256/saklama/okuma. WAV16MiB, JSON40000byte, metin8000karakter sınırı. Bozuk/eski/symlink baseline veya değişmiş ses null; kaynak ses ve kullanıcı metni değiştirilmez.
- `src/dub-service.js`: yeni referans yollarına baseline/iptal artifact sahipliği; hazırlama sonrası immutableilkASR; listede ses kimliği doğrulanmış baseline. Düzeltilmiş metin uygulandığında ilk kayıt korunur ve güncel kullanılabilirlik döner. Ana metadata4000byte sınırı genişletilmedi.
- `voice-reference-ui.js`: aynı/düzenlenmiş/bilinmeyen EN/TR durumları, açık karşılaştırma, güvenli textContent, taslağa geri getirme. Mevcut TranslationDiff.wordParts reuse. Plaintext'teki HTML/ASSbenzeri literal içerik yanlışlıkla altyazımarkup'ı gibi temizlenmez; tammetinfallback.
- `index.html/browser-chrome.css`: mevcut tema/token/fontlarla açılır kart, dar referans kolonunda yığılmış iki metin,40pxkontrolhedefi. Karşılaştırma kullanıcı metnini arayüz çeviricisine sokmaz. Yeni kütüphane/ayar/IPC kanalı yok; ek bir isteğe bağlı yerel JSON şeması version1 var.
- Testler: yeni baseline/fs+UI davranışları; mevcut reference service hazırlama/uygulama testinde ilkASR'nin korunduğuna ek assertion; gerçek native görsel smoke.

## Hedefli kanıt

Node4subtest PASS: yeni ses bytes değişmesi/hash invalidation, bozuk/olmayan baseline, farklı metni güvenli gösterme, restore'un API yazmaması, EN/TR/legacy; mevcut voice-reference-ui ve service akışları PASS. Hazırlamadan dönen ilk text sonradan uygulanmış Corrected transcript ile değiştirilmez. Syntax/diff PASS.

[Gerçek Windows kabul JSON](REFERENCE721_2026-10-28/acceptance.json): ayrı uygulama profili, kontrollü baseline ve sentetikWAV. **Bu native kabulde canlı ASR çalıştırılmadı**; üretim list/read ve renderer gerçek, ilkASR fixture'ı bilinçli ekildi. Hazırlama servisinin sidecar oluşturması kontrollü Node servistestinde sınandı; backend smallmodel ASR davranışı değiştirilmedi.

[TR koyu düzenleme](REFERENCE721_2026-10-28/edited-tr.png), [EN açık %125](REFERENCE721_2026-10-28/same-en-light-125.png), [ses değişince bilinmeyen](REFERENCE721_2026-10-28/unknown-en-light.png). Ekranlar açılıp incelendi.1000×950pencere/1.25zoom=800CSSpx, kartx59.4..732.6,taşmayok,restore46CSSpx. Kayıtlı döküm değişmeden taslak restore; WAVsonbyte değişince gerçek listAPI baseline'ı reddetti.

İlk dar yakalamada locale/yerleşimden sonra kart viewportdışında kalmıştı; testin scroller/odak adımı düzeltildi ve native tekrarPASS. Bunu ürün tasarım hatası diye saymadım.11listeneruyarısı susturulmadı; ağ kapalı testte filtre indirme uyarısı beklenen, canlıadblocktesti değil.

## Tasarım incelemesi — sınırlı yüzey

Frontend-design rehberiyle mevcut tema içinde çalışıldı; yeni font/palet/sistem getirilmedi.

| Önem | Yer | Önce | Sonra | Neden |
|---|---|---|---|---|
| Orta | Referans metni | İlk tanıma metni düzenlenince karşılaştırma kalmıyor | Ses kimliğine bağlı ilk kayıt ve fark kartı | Yanlış dökümü fark etmeyi kolaylaştırır |
| Orta | Kaynak kanıtı | Eski kaydın ilk tanıması bilinmiyor | Bilinmeyen/aynı/düzenlenen ayrı ifadeler | Kanıt yokken uyum iddiası üretmez |
| Düşük | Dar referans kolonu | Yeni karşılaştırma için yer yok | İsteğe bağlı details, yığılmış okunur metinler | İki dar kolon ve geniş zorunlu alan eklenmez |
| Düşük | Düzeltme akışı | İlk metne dönme yolu yok | Yalnız taslağa geri getirme | Kayıt/etkin ses kullanıcı eyleminde kalır |

Değerlendirilip seçilmeyenler: yüzdelik “ses uyum puanı” (metinselASRkarşılaştırması böyle bir iddiayı taşımaz); ilk dökümü otomatik zorla uygulamak (kullanıcıASRhatasını düzeltmiş olabilir); yeni jsdiff bağımlılığı/iki dar yataykolon (mevcutboundedfarkgösterici yeterli ve referanskolonu dar). Bunlar uygulanıpA/Bölçülmüş seçenekler diye sunulmaz.

Aynı/değişmiş/eksik kayıt, açılmış kart, restore, EN/TR ve açık/koyu/dar görünüm kontrol edildi. Native klavye tümkombinasyonları/ekranokuyucu/hoveranimasyon/yüklemehatası/multiplelongrefs için kapsamlı görsel kabul yapılmadı. Yeni özelanimasyon yok; mevcut details/buttonfocus stili kullanılır. Bu dar yüzey teslim edilebilir; genel arayüz denetimi tamamlandı değildir.

## Dış kaynak ve sınırlar

[jsdiff word.ts](https://github.com/kpdecker/jsdiff/blob/master/src/diff/word.ts) gerçek tokenizer/whitespace/word change kodu ve [BSD3lisansı](https://github.com/kpdecker/jsdiff/blob/master/LICENSE) incelendi. Eski word.js yolu404çıktı, güncelTSkaynağa geçildi. Yeni kod kopyalanmadı/dependency alınmadı; mevcut boundedLCS TranslationDiff reuse edildi. Bu özellik semantikASRhatasını veya gerçekakustikhizalamayı çözmüş sayılmaz.

start.bat/install.bat bu smoke ile sınanmadı; launcher değişmedi, kişisel uygulama kapatılmadı. ASR/GPU/ses kalitesi/canlıYouTube/gerçekkişiselreferans/DRM yok. CI/tamnpmtest beklenmedi. Eski kayıtların karşılaştırması için yeniden hazırlama gerekir; göç zorlanmaz. P033 kısmi ilerleme, P035 birleşik referans yönetimi ayrıca. Müzik kapsam dışı ve90aktifhedef devam eder.
