# BROWSER BUG REPORT 48 — CEA zaman eşlemesi, tekrar çeviri ve görsel filtre günlüğü

Tarih: 2026-09-16. Başlangıç ürün kodu: `ab5711b504358f0e64773eb6fe5b8bfaf2b528db`.

## Sonuç ve bulgu durumları

| Kimlik | Belirti | Durum |
| --- | --- | --- |
| B48-1 | Great Courses gömülü CC1 altyazısı oynatıcı saatinden kayıyor | Kod düzeyinde düzeltildi ve sentetik fMP4 regresyonu geçti; gerçek site kabulü açık |
| B48-2 | Model kanalı bulunmayan HTTP 503 çok sayıda cümlede tekrar isteniyor | Düzeltildi, devre kesici ve manuel kurtarma test edildi |
| B48-3 | Aynı iz/yalnız komşu bağlam yenilemesinde gereksiz çeviri isteği | Düzeltildi, scheduler ve renderer davranışı test edildi |
| B48-4 | Reklam görsel filtresi aynı sayfada aynı uyarıyı defalarca yazıyor | Günlük sönümlemesi düzeltildi; alttaki siteye özgü CSS hatasının nedeni ayrıca kanıtlanmadı |

## Ayrıntılı bulgu

### B48-1 — CEA saat kökeni

Kullanıcının ekranında yaklaşık 00:36'da gösterilen yerel altyazı cümlesi, aynı ders için kaydedilen kaynak SRT'de 00:44,167'de başlıyor. Bunlar tek anlık görüntüye dayandığından sabit bir sekiz saniyelik site kuralı olduğu iddia edilmiyor. Kodda `CeaCaptionDecoder.decodeFragmentedMp4` ham fMP4 saatini cue'ya veriyor; `captureBrowserHlsCeaSegment` yalnız cue yerel segment zamanlı görünürse HLS başlangıcını ekliyordu. fMP4 `tfdt` başlangıcı sıfır değilse ham saat ile oynatıcı/HLS saati farklı kalabiliyor. Gerçek mux.js MP4 fixture'ının `tfdt` değerini +8 saniye değiştirince decoder başlangıcı 8 oldu; yeni eşleme bunu oynatma listesi başlangıcı 0'a taşıdı.

### B48-2 — Kullanılamayan model kanalı

Kullanıcının günlüğünde sağlayıcı `HTTP 503: No available channel for model ...` döndürdü. Önceki kod bütün 5xx yanıtlarını yeniden denenebilir sayıyor, cümle kuyruğu da her cümleyi bağımsız sürdürüyordu. Bu model/yönlendirme hatası geçici yoğunlukla aynı sınıfa konduğu için çok sayıda boşuna istek ve hata satırı oluşuyordu. Gerçek sağlayıcı çağrısı yapılmadı; hata davranışı kontrollü sahte yanıtla doğrulandı.

### B48-3 — Gereksiz tekrar çeviri

`reconcileSentences`, komşu cümle eklendiğinde yalnız `contextAfter` değişmiş olsa bile tüm cümle nesnesini farklı sayarak hazır/çalışan sonucu siliyordu. Aynı kaynak izi tekrar `İzi seç ve çevir` yolundan başlatmak da renderer'daki hazır sonuç haritasını sıfırlıyordu. Bunlar her video veya her istek için tekrar çeviri olduğu anlamına gelmez; ancak büyüyen iz ve ikinci tıklama için erişilebilir maliyet yoludur. Günlükteki YouTube Whisper işlerinin 0–600 saniye ve sonrası olarak iki farklı aralıkta çalışması ise bu kanıtla aynı cümlenin iki defa çevrildiğini göstermez.

### B48-4 — Tekrarlanan kozmetik uyarı

`createCosmeticExecutor` her CSS çalıştırma reddini üst katmana iletiyor; `browser-adblock.js` her redde aynı genel uyarıyı yazıyordu. Gezinmede yok olan yürütme bağlamı beklenen yaşam döngüsü yarışı olmasına rağmen görünür hata olabiliyordu. Kullanıcının konsolunda aynı satırın art arda tekrar etmesi bu olay yoluyla tutarlı. Gerçek CSS reddinin siteye özgü kök nedeni kullanıcı günlüğünde bulunmadığından filtre motorunun kendisi hatalı diye işaretlenmedi.

## Düzeltme

- fMP4 video parçasının `tfdt` başlangıcını mevcut sınır denetimli MP4 kutu ayrıştırıcısıyla okuma; CEA cue saatini o parçanın HLS başlangıcına taşıma. Zaten eşlenmiş cue'ya ikinci kez yerel-segment ofseti eklenmiyor. Eksik/bozuk `tfdt` için eski davranış korunuyor.
- Bilinen `503 + No available channel` yanıtı terminal sağlayıcı hatası olarak sınıflandırılıyor. Scheduler aynı oturumun kalan kuyruğunu durduruyor, ilk hatayı gösteriyor, tamamlanmış çevirileri saklıyor. Kullanıcının açık yeniden denemesi devreyi sıfırlayabiliyor. Genel 503/429 geçici hata yeniden denemesi korunuyor.
- Yalnız komşu `contextBefore/contextAfter` değişince aynı cümle sonucu ve uçuşan istek korunuyor. Metin, cue sınırları, zaman veya açık bağlam sürümü değişirse yeniden çeviri sürüyor. Aynı izi ikinci seçiş, sıfırdan scheduler açmak yerine mevcut izde artımlı yenileme yapıyor; hata varsa yalnız başarısız cümleleri yeniden deniyor.
- Beklenen gezinme-bağlamı kaybı kozmetik uyarıya çevrilmiyor. Gerçek kozmetik hata aynı WebContents/sayfa için bir kez yazılıyor; yeni sayfadaki gerçek hata yine görünür.

## Ret gerekçesi ve açık sınırlar

- Great Courses için SRT'ye sabit `-8 sn` uygulamak reddedildi: tek ekran görüntüsü her ders/kalite varyantı için sabit ofset kanıtı değil. Ofset medya parçasının saatinden hesaplanıyor.
- Reklam engelleyiciyi kapatmak veya bütün CSS hatalarını susturmak reddedildi: gerçek hata yeni sayfada görünür kalmalı.
- Bütün 503'leri terminal saymak reddedildi: geçici servis yoğunluğu yeniden denenebilir kalıyor.
- Canlı sağlayıcıya ücretli çağrı yapılmadı; token tasarrufunun parasal miktarı ölçülmedi. Gerçek Great Courses oturumunda aynı cue'nun yerel altyazıyla birkaç zaman noktasında yeniden karşılaştırılması ve YouTube'da gerçek istek sayacının izlenmesi kabul adımı olarak açık.
- Kullanıcının özel oturumu, anahtarları ve ham günlüğü depoya kopyalanmadı. Bu rapordaki kanıt sınırlı ve anonimleştirilmiş özet.

## Doğrulama dökümü

- Gerçek mux.js fMP4 fixture'ında `tfdt` +8 saniye mutasyonu: ham cue başlangıcı 8, HLS başlangıcı 0 ile eşlenmiş cue başlangıcı 0; daha sonraki HLS başlangıcı 20 ise eşlenmiş cue başlangıcı 20.
- Sağlayıcı sahte yanıtı: 12 cümlede kanal yok hatasıyla en fazla iki eşzamanlı çağrı; kalan cümleler yeni istek olmadan terminal duruma geçiyor. Artımlı kaynak yenilemesi devreyi açmıyor; manuel yeniden denemeyle 13/13 tamamlanıyor.
- Renderer VM davranışı: aynı iz ikinci kez seçildiğinde çeviri sonuç haritası korunuyor; kısmi hatada yalnız hatalı cümlelerin yeniden denemesi çağrılıyor.
- Adblock entegrasyon testi: aynı sayfada beş CSS reddi tek uyarı; yeni sayfada yeni uyarı; gezinme bağlamı kaybında uyarı yok.
- Hedefli Node testleri: `browser-cea-captions`, `browser-translation-provider-error`, `browser-translation-refresh`, `browser-adblock`, `subtitle-sentence-layout` geçti.
- İlk tam `npm test` koşusunda yalnız `subtitle-sentence-layout` test VM'si yeni saf sınıflandırıcıyı bağlamına almadığı için başarısızdı; VM güncellendi ve bilinen 503 örneği eklendi. Nihai tam koşu ve Electron köprü sonucu devir notunda ayrıca kayıtlı.
- Nihai `npm test` → çıkış 0, `Tüm testler geçti`; Python backend 180/180 dahil.
- `npm run test:electron-bridge` → çıkış 0.
- `npm run test:soak` → 400/400 yakalama ve 50/50 hibernasyon; 24/24 bütçe geçti.
- JS sözdizimi, Python `py_compile` ve `git diff --check` → geçti.
