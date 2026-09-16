# Browser Bug Report 49 — Great Courses CEA zaman çizgisi kalibrasyonu

Tarih: 2026-09-16
Başlangıç HEAD: `beec1b6fb610b0c9b507eec57d19825bb8d18053`
Ürün düzeltme commit'i: `57214fd718c8c52b4fb7d850f1731960c8d0aacb`

## Sonuç özeti

Kullanıcının “zaman kodları yine uymuyor” bulgusu **DOĞRULANDI ve kod düzeyinde DÜZELTİLDİ**. Önceki rapor 48'deki B48-1 düzeltmesi yalnız fMP4 decode saatini HLS parça saatine eşliyordu; yeni gerçek-site kanıtı bu çözümün etkilenen Great Courses akışında yeterli olmadığını gösterdi. B48-1'in gerçek-site kabulü bu nedenle **BAŞARISIZ / KISMEN KAPALI** olarak yeniden sınıflandırıldı.

Gerçek hesapla yama sonrası kabul bu oturumda çalıştırılamadı. Son durum: otomatik ve fixture doğrulamaları geçti; kullanıcı uygulamayı yeniden başlatıp aynı dersi yeniden tam yakaladığında gerçek-site kabulü tamamlanacak.

## B49-1 — Tam CEA kaydının site altyazısından yaklaşık sekiz saniye geç olması

Durum: **DOĞRULANDI → DÜZELTİLDİ (gerçek-site kabulü bekliyor)**
Önem: P1 — kullanıcı ekranda yanlış konuşmanın altyazısını görüyor ve çevrilmiş dosya yanlış zaman koduyla üretiliyor.

### Kanıt

Etkilenen kaynak dosya:

`C:\Users\K\Downloads\Whisper\GİRDİ\Religion in the Ancient Mediterranean World The Great Courses Plus.5ede7b75.source.CC1.srt`

- Yakalanan SRT'de “In the last lecture…” başlangıcı: **00:19.977**
- Yakalanan SRT'de “All of Egyptian religion…” başlangıcı: **00:28.018**
- Kullanıcının 00:20 ekran görüntüsünde sitenin yerel altyazısı “All of Egyptian religion…” iken uygulama katmanı “In the last lecture…” gösteriyor.
- Aynı örüntü önceki Creation Stories örneğinde de görüldü: 00:36'da site bir sonraki cümleyi gösterirken yakalanan SRT önceki 00:33.357 cue'sunu gösteriyordu.
- Buna karşılık Classical Mythology örneklerinde 00:25 ve 02:14 cue'ları siteyle eşleşiyordu. Dolayısıyla bütün Great Courses içeriklerine sabit `-8 sn` uygulamak hatalı olurdu.

### Kök neden

Tam HLS/CEA yakalaması ile sayfanın oynatıcısının yerel `TextTrack` sunum saati bazı akışlarda aynı kökene sahip değil. Manifest ve video parçalarından çözülen CEA cue'ları içerik olarak tam olsa da, oynatıcının fiilen gösterdiği zaman çizgisine göre akışa özgü sabit bir ofset taşıyabiliyor.

Rapor 48'de eklenen `tfdt` eşlemesi gerekli bir korumaydı ancak tek başına yeterli değildi. Kullanıcının verdiği herkese açık Akamai akışından ilk altı CMAF parçası ölçüldü; bu örnekte decode başlangıcı ile ilk sample composition başlangıcı aynı çıktı. Bu nedenle mevcut yaklaşık sekiz saniyelik farkın yalnız `tfdt`/composition farkından doğduğu iddiası **reddedildi**.

### Düzeltme

1. `src/browser-cue-timeline-calibration.js` eklendi.
   - Site `TextTrack` cue'ları ile tam çözülen CEA cue'larını benzersiz, normalize edilmiş metin üzerinden eşleştiriyor.
   - Eşleşmelerden medyan ofset çıkarıyor.
   - En az iki tutarlı eşleşme veya tek ve yeterince uzun güçlü eşleşme olmadan zaman çizgisini değiştirmiyor.
   - Çelişkili örneklerde, 120 saniyeyi aşan farklarda veya kanıt yokken kapalı kalıyor.
2. Tam CEA yakalaması bittiğinde bütün frame'lerden zorunlu yerel track snapshot'ı alınıyor.
3. Dil ve `CC1`/track etiketiyle doğru referans iz seçiliyor.
4. Yalnız kabul edilen ve 50 ms'den büyük ofset tam kaynak cue'larına uygulanıyor; kaydedilen SRT ve ardından başlayan çeviri aynı düzeltilmiş zaman çizgisini kullanıyor.
5. Tanıya `calibrated` olayı ve örneğin `zaman düzeltmesi -8.000 sn` bilgisi ekleniyor.
6. fMP4 sunum koruması ayrıca güçlendirildi: ilk `trun` sample composition ofseti `tfdt` başlangıcına ekleniyor.

### Ret gerekçeleri

- **Siteye sabit -8 saniye:** reddedildi; doğru çalışan Classical Mythology kayıtlarını bozar.
- **Yalnız fMP4 composition ofseti:** tek çözüm olarak reddedildi; ölçülen gerçek Akamai parçalarında decode ve composition başlangıcı eşitti.
- **Tek kısa cue ile kaydırma:** reddedildi; “Yes”, “Hello” gibi tekrar eden metinler yanlış kalibrasyon üretebilir.
- **Eşleşme bulunmadığında tahmin:** reddedildi; yanlış zaman kodu üretmek yerine mevcut çizgi korunuyor.

## Değişen dosyalar

- `src/browser-cue-timeline-calibration.js`: güvenli, saf zaman çizgisi kalibrasyonu.
- `src/main.js`: tam CEA yakalaması sonunda yerel TextTrack snapshot'ı ve akışa özgü düzeltme.
- `src/browser-subtitles.js`: ilk fMP4 video sample'ının composition başlangıcı.
- `src/browser-cea-captions.js`: CEA sunum saatini composition başlangıcına bağlama.
- `tests/browser-cue-timeline-calibration.test.js`: gerçek kullanıcı kanıtı, çelişki reddi ve doğru track seçimi.
- `tests/browser-cea-captions.test.js`: `trun` composition ofseti regresyonu.

## Ayrıntılı doğrulama dökümü

- `node tests/browser-cue-timeline-calibration.test.js` → **3/3 geçti**
- `node tests/browser-cea-captions.test.js` → **7/7 geçti**
- `node tests/browser-track-kind.test.js` → **geçti**
- `node --check src/main.js` ve değişen JS dosyaları → **geçti**
- `backend\venv\Scripts\python.exe -m py_compile backend\transcribe.py` → **geçti**
- `npm test` → **çıkış 0, Tüm testler geçti; Python 180/180 dahil**
- `npm run test:electron-bridge` → **çıkış 0**
- `npm run test:soak` → **çıkış 0**; yakalama 399/400 (0,9975 ≥ 0,98), hibernasyon 50/50, kaynak bütçeleri 24/24
- `git diff --check` → **hata yok**; yalnız Windows LF/CRLF bilgilendirmeleri

## Gerçek-site kabul adımları

1. Uygulamayı tamamen kapatıp yeniden başlat.
2. Aynı Great Courses dersinde site altyazısını `1-CC1` olarak aç.
3. `Tüm altyazıyı getir` işlemini yeniden çalıştır; eski SRT kendiliğinden değişmez.
4. Ayrıntılar panelinde `cea · calibrated` ve ölçülen zaman düzeltmesini doğrula.
5. Yeni kaynak SRT'de “All of Egyptian religion…” cue'sunun yaklaşık 00:20'ye geldiğini kontrol et.
6. Classical Mythology gibi zaten doğru akışta anlamlı bir düzeltme uygulanmadığını (yok veya yaklaşık sıfır) doğrula.

Bu kabul yapılana kadar “bütün gerçek Great Courses akışlarında kusursuz” iddiası yapılmamalıdır.
