# Browser Bug Raporu 41 — Great Courses CEA planı için doğrudan tam-yakalama eylemi

Tarih: 2026-09-16
Başlangıç ürün kodu: `2b4e4a326f400c171f974feaf8e3115f713f5a97`
Kapsam: Great Courses gerçek-site tanısı sonrası `1-CC1` tam kaynak yakalama akışının kullanıcıya doğru sunulması.

## Gerçek-site kanıtı

Kullanıcının `caption-mu3nm2x6-6` tanı paketi şu zinciri doğrudan kanıtladı:

- Sayfa yanıt veriyor; güvenlik ölçümü/pending körlüğü yok.
- `master.m3u8` yakalanıp işlendi.
- Manifest `CC1` gömülü CEA izini bildirdi.
- Tam plan 906 video parçası içeriyor.
- fMP4/CMAF CEA çözücüsü çalıştı ve oynatma konumundaki parçalardan 5 ve 4 cue üretti.
- Ayrı video ve ses child playlistlerinin “kullanılabilir altyazı izi yok” diye elenmesi doğru; altyazı ayrı text track değil, video parçalarına gömülü.

Böylece rapor 40'taki adaylardan A1, A4 ve A5 bu akış için elendi; A2/A3 düzeltmesi gerçek sitede doğrulandı. Gösterilen 5+4 cue tam bölüm değil, mevcut oynatma konumundaki sınırlı önizleme yakalamasıdır.

## BUG-41-01 — P2 — Hazır tam CEA planı üst şeritte genel çeviri eylemi olarak görünüyordu

### Kök neden

`browserSubtitleHealth` yalnız cue/iz/çeviri durumlarını değerlendiriyordu. `player.browserCeaCapture` içinde `available: true`, `state: ready` ve 906 segmentlik plan bulunmasına rağmen üst şerit bunu bilmiyordu. Bu nedenle kullanıcı “Gömülü CC bulundu — tümünü getir” yerine “Hedef dilde site altyazısı bulunamadı / İzi seç ve çevir” mesajını görüyordu. Tam-yakalama düğmesi alt iz panelinde vardı; fakat gerçek sorunun çözümü üst şeritte görünür değildi.

### Düzeltme

- Sağlık modeli artık `ceaAvailable`, `ceaState` ve `ceaMessage` alıyor.
- Hazır plan: `Gömülü CC altyazısı bulundu` + `Tüm altyazıyı getir`.
- Çalışan/yenilenen/bekleyen plan: gerçek ilerleme mesajı; ikinci başlatma eylemi yok.
- Kısmi/hatalı plan: `Eksikleri yeniden dene`.
- Tam plan: normal hazır altyazı/çeviri durumuna döner.
- `cea-capture-progress` olayı üst sağlık şeridini anında yeniden çiziyor.
- Yeni `capture-full` eylemi doğrudan mevcut `toggleBrowserCeaFullCapture` yoluna bağlı; aynı IPC, iptal, sıralı decoder, 906 segment planı ve tamlık kapıları kullanılıyor.

Bu değişiklik otomatik olarak 906 video parçasını izinsiz indirmez. Kullanıcının tek açık tıklaması korunur; ardından düşük bant genişlikli varyant üzerinden tam CEA yakalama başlar. Çeviri butonu kullanılırsa mevcut akış zaten önce tam kaynak yakalamayı, tamamlanınca çeviriyi başlatır.

## Ayrı gözlem

Ekrandaki “Video karesi üretilemiyor” uyarısı altyazı/CEA hattının hatası değildir; video kare analizi/OCR tanısıdır. Tanı paketi CEA segmentlerinin ağdan çözüldüğünü kanıtladığı için bu uyarı tam altyazı yakalamayı engellemez. Ayrı bir playback-diagnostics kabul örneği olmadan bu turda davranışı değiştirilmedi.

## Doğrulama

- `node tests/browser-subtitle-health.test.js` — hazır/çalışıyor/kısmi/tamam CEA durumları ve `capture-full` bağlantısı geçti.
- `node tests/browser-cea-full-capture.test.js` — sıralı yakalama, tamlık, otomatik eksik retry geçti.
- Electron `tests/electron-browser-cea-full-ui.smoke.js --disable-gpu` — geniş/dar görünümde düğme, ilerleme, 84/312 segment, 126 satır ve %25 süre kapsamı geçti.
- `npm test` — exit 0; son satır `Tüm testler geçti`.
- `npm run test:electron-bridge` — exit 0.
- `node --check` (`main.js`, `preload.js`, `renderer.js`) ve `python -m py_compile backend/transcribe.py` — geçti.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

1. **Bulgu:** gerçek HLS master, bildirimli CC1, 906 segment ve çalışan CEA decoder kanıtlandı. **Sonuç:** canlı Whisper, DASH-CEA veya bildirimsiz CEA çözümü bu site için doğru yön değil.
2. **Bulgu:** yalnız yakındaki parçaların 5+4 cue üretmesi tasarlanmış önizleme davranışı; tam kaynak için açık tam-yakalama işi gerekiyor. **Düzeltme:** hazır plan üst şeritte doğrudan `Tüm altyazıyı getir` olarak sunuldu.
3. **Bulgu:** genel `İzi seç ve çevir` mesajı gerçek planı gizliyordu. **Düzeltme:** CEA yaşam döngüsü sağlık modeline eklendi ve her ilerleme olayında yenileniyor.
4. **Ret:** 906 video parçasının otomatik/izinsiz indirilmesi reddedildi; ağ ve depolama maliyeti nedeniyle açık kullanıcı eylemi korunuyor.
5. **Doğrulama:** saf durum matrisi, CEA tam-yakalama testi, gerçek Electron UI smoke, tam paket ve köprü testi yeşil.
6. **Açık kabul:** yeni sürümde Great Courses sayfası yenilendiğinde üst şeritte `Tüm altyazıyı getir` görünmeli; tıklama sonrası 0/906 ilerleyip tam cue sayısı ve GİRDİ klasörüne kaydetme ile bitmelidir. Gerçek 906-parça indirme bu geliştirme oturumunda kullanıcı hesabı üzerinden koşturulmadı.
