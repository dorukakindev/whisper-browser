# Rapor 731 — İki kayıtlı referansı dinleyerek karşılaştırma

## Özellik ve kullanım

Browser veya yerel oynatıcıdaki SRT → Ses stüdyosunu aç; Referans sesler bölümündeki **İki referans sesi karşılaştır** düğmesine bas. Ortalanmış ayrı pencerede A ve B listelerinden kayıt seçip dinle. B başlayınca A durur; ana referans önizlemesi de aynı anda çalmaz. Dinleme varsayılan sesi değiştirmez. Kartın **Bu sesi kullan** düğmesi mevcut güvenli referans uygulama yolunu çağırır ve sonucu pencerenin içinde bildirir. Üretim/referans hazırlama sırasında seçim ve uygulama kilitlenir. Silinen kayıtların ses URL'si temizlenir. Kapatma/Escape sesleri durdurur ve odağı açıcıya döndürür.

Bu, iki referans kaydının ses karakterini karşılaştırır. Aynı metnin iki farklı referansla TTS üretildiği A/B kalite kabulü değildir; açıklama bunu belirtir. P038 bu nedenle kısmi kalır. Metin stüdyosu/kitap ekranına ayrı giriş ve gerçek sentez karşılaştırması bu pakette yapılmadı.

## Dosyalar ve tasarım

- `src/renderer/voice-reference-compare.js`: iki kaynak/oynatım yaşamı, tek ses ilkesi, açık kullanım, yerelleştirme, boş/kilitli durum ve modal odak dönüşü.
- `src/renderer/voice-reference-compare.css`: ortak grafit/amber ve açık tema token'ları, ortalanmış modal, 42px seçim/eylem hedefi, 650px altında tek sütun, azaltılmış harekete saygılı kısa açılış geçişi.
- `src/renderer/index.html`: self-hosted CSS/script ve mevcut referans bölümüne açıcı alanı. CSP gevşetilmedi.
- `src/renderer/voice-reference-ui.js`: mevcut kayıt listesi ve üretim kilidiyle entegrasyon; mevcut useSelected yolu korunur. Karşılaştırma/main preview aynı anda çalmaz; ana stüdyo kapanınca durur.
- `tests/voice-reference-compare.test.js`: seçim uygulamadan iki kaynak, medya konumu korunumu, birbirini durdurma, explicit use, dil değişimi, kilit ve kaldırılmış kayıt temizliği.
- `tests/electron-reference-transcript.smoke.js`: mevcut döküm kabulüne ikinci sentetik referans, gerçek iki WAV decode/karşılıklı pause, diskten varsayılanın korunumu ve B'nin açık seçimle gerçekten kaydı, modal merkez/kapama hedefi, dar tek sütun ve gerçek Escape/odak dönüşü eklendi. Sonunda ilk referans geri seçilip eski baseline kabulü sürdürülür.

İlk gerçek görüntüde yan sütuna eklenen iki kart sıkışıyordu; teslim edilmedi ve ayrı modal yapıldı. Sonraki görüntüde global stillerden gelen sol üst konum, büyük kapatma düğmesi ve varsayılan select görünümü saptanıp ortak tema kurallarıyla düzeltildi. Son geniş TR koyu/800CSSpx EN açık/608CSSpx dar görüntüler incelendi.

## Kanıt

4 hedefli Node testi, ayrı voice-reference-ui script'i, JS syntax ve diff geçti. Gerçek Windows/native/preload/main/disk kayıt ve decoder kabulü exit0. WAV kişisel değil, önceden üretilmiş sentetik konuşmanın iki ayrı test kaydı; testte sessize alınarak decode/play/pause ölçüldü. Yeni TTS veya insan tercihi sonucu değildir. Döküm taslağı restore ve değiştirilmiş WAV baseline reddi de korunur.

İki native deneme60s üst sınıra ulaştı. Kayıt/görüntü adımları, testin requestAnimationFrame beklerken arka planda kalmasına işaret etti; standart disable-renderer-backgrounding ve disable-backgrounding-occluded-windows bayrakları test sürecine eklendikten sonra kısa son koşum geçti. Bu durum ürünün gerçek motor takılması olarak sayılmadı; eşik yükseltilmedi. Mevcut11before-quit listener ve testin kasıtlı ağ reddinden gelen reklam filtresi uyarıları kayıtlıdır.

- [TR koyu karşılaştırma](evidence731/compare-tr-dark.png)
- [EN açık %125](evidence731/compare-en-light-125.png)
- [Dar EN tek sütun](evidence731/compare-en-narrow-125.png)

```powershell
node --test --test-isolation=none tests/voice-reference-compare.test.js tests/voice-reference-baseline.test.js
node tests/voice-reference-ui.test.js
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-reference-transcript.smoke.js --reference <sentetik.wav>
```

## Kaynak/sınırlar

Mevcut referans listeleme/use ve HTMLAudioElement önizleme akışı kullanıldı. [WaveSurfer player.ts](https://github.com/katspaugh/wavesurfer.js/blob/main/src/player.ts) medya pause/load/yaşam döngüsü yaklaşımı incelendi; dış kod/dependency alınmadı. frontend-design ve make-interfaces-feel-better rehberleri kullanıldı. Yeni API, kalıcı şema, kurulum veya start.bat değişikliği yok.

Gerçek model/GPU/ASR/insan ses tercihi, tüm erişilebilirlik/DPI kombinasyonları, yeni BAT başlangıcı, tam test paketi ve CI sonucu doğrulanmadı. Reduced-motion CSS koruması var, bu turda işletim sistemi tercihi ayrıca simüle edilmedi. CI açık, beklenmedi. R728 gerçek GPU kitap kabulü açık; müzik kapsam dışı ve90hedef sürer.
