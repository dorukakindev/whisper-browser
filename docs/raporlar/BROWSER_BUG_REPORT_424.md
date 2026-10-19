# Rapor 424 — YouTube reklam filtresi ve betik çalıştırma

Tarih: 2026-10-15. Başlangıç: ceaca2bb0fb3b2fd5309228c544c220bc7256d5f.
Kod: ededdfb626c8c8bcfc9014874cbc073bd0839e10.

## Doğrulanan bulgular ve düzeltmeler

1. Reklam scriptlet'leri WebContents.executeJavaScript üzerinden tam sayfa yüklemesine kadar kuyrukta tutuluyordu. Fetch/JSON sarmalayıcıları bazı oynatıcı isteklerini kaçırabiliyor, ana sayfa CSS'i yavaş kaynakları bekliyordu. IPC'nin gerçek senderFrame'i üzerinde çalıştırma ve erken insertCSS eklendi. URL değişimi, yok edilmiş frame ve site duraklatması kontrol edilir; eski frame yoksa önceki sınırlı kuyruk yolu korunur.
2. Ghostery kaynakları scriptlet başına aynı yardımcı fonksiyonları ve JSONPath gibi sınıfları bildiriyor. Ayrı çağrıların ortak global kapsamı isim çakışması ve proxy recursion üretebiliyordu. Erken çalıştırmanın ara sürümünde canlı YouTube üzerinde `Identifier 'JSONPath' has already been declared`, `Maximum call stack size exceeded` ve yükleme iskeleti görüldü. Her scriptlet kendi fonksiyon kapsamına alındı. Filtre kapalı karşılaştırması ve kapsam düzeltmesi sonrasında video oynadı. Bu yalnız kaynak koddan çıkarım değildir; özel test çıktısıyla gözlendi.
3. Session preload'u soğuk filtre indirmesi bittikten sonra kaydedilirse zaten açılmış ilk belgeye uygulanmıyordu. İlk etkinleştirmede mevcut HTTP(S) sayfalarına temel kurallar uygulanır. Sayfa otomatik yenilenmez; ilk istekten önce engelleme garantisi yoktur.
4. Motor belleğe alındıktan sonra uygulama açık kaldığı sürece bir daha filtre indirmiyordu. Önbellek süresi 24 saatten 6 saate indirildi; uygulama açıkken yenileme zamanlanır. Yeni motor hazırlanırken eski motor çalışır; etkinleştirme başarısızsa geri alınır, çevrimdışı kalınca mevcut filtreler korunur. Kapalı koruma kendiliğinden açılmaz. Başarısız yenileme 30 dakika sonra tekrar denenir. Yeni scriptlet'lerin zaten açık belgelerde tam etkisi için sayfayı yenilemek gerekebilir.
5. Reklam/Atla araması yalnız querySelector'ın ilk eşleşmesine bakıyordu. YouTube gizli eski düğmeyi DOM'da tutarken sonraki görünür düğme kaçabiliyordu. Aynı seçicinin diğer görünür eşleşmeleri de değerlendirilir; görünür düğme varsa videonun sonuna sarma yerine tıklama kullanılır.
6. HTTP 503/404 filtre gövdesi geçerli filtre gibi tüketilebiliyor, zaman aşımı yalnız başlıklar gelene kadar sürüyordu. HTTP başarısızlıkları reddedilir; gövde okunana kadar abort süresi korunur. Motor dosyası geçici dosya + rename ile yazılır.

## GitHub araştırması

- [Ghostery Electron entegrasyonu](https://github.com/ghostery/adblocker/blob/master/packages/adblocker-electron/README.md): mevcut motorun session/preload ve serialization yapısı kullanıldı.
- [Ghostery filtre kaynakları](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/src/fetch.ts): ads-only zaten uBlock Quick fixes ve resources.json içeriyor. Ayrı rastgele liste veya ikinci engelleyici eklenmedi.
- [YouTube Quick fixes](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/assets/ublock-origin/quick-fixes.txt) ve [EasyList](https://github.com/ghostery/adblocker/blob/master/packages/adblocker/assets/easylist/easylist.txt): oynatıcı cevapları, karşı-engelleme ve ana sayfa kart kuralları incelendi. Yeni uBlock kodu kopyalanmadı; mevcut Ghostery'nin resmi dağıtım kaynakları kullanılır.
- [Electron frame.executeJavaScript](https://www.electronjs.org/docs/latest/api/web-frame-main#frameexecutejavascriptcode-usergesture): mesajın geldiği frame'de değerlendirme yolu.

## Kanıt ve sınırlar

- Gerçek resmi filtre indirmesi: YouTube için 29 scriptlet, 1297 karakter CSS; ana sayfa ad-slot ve adPlacements kuralları mevcut.
- Windows Electron yerel fixture: uzun yüklenen görüntü varken document.readyState=interactive aşamasında reklam kartı gizlendi, normal içerik block kaldı, scriptlet çalıştı. Aynı sınıf/yardımcı isimlerini kullanan iki scriptlet bağımsız 1 ve 2 döndürdü.
- Ayrı anonim Electron profili, gerçek YouTube ana sayfa + Blender Big Buck Bunny: görünür reklam kartı 0, görünür enforcement/error uyarısı yok; video readyState=4, currentTime yaklaşık 12.48 sn ve paused=false. Ağ motoru toplam 4 istek engelledi. Console'da önceki iki scriptlet hatası gözlenmedi. Ekran görüntüsü incelendi.
- Canlı test kullanıcının açık uygulaması veya oturum açılmış hesabı değildir; sayfada o anda reklam sunulmaması da mümkündür. Bu sonuç tüm reklamları, bölgeleri, hesapları, SSAI deneylerini veya gelecekteki YouTube değişikliklerini kapsamaz.
- Browser adblock, media-controller (33), cosmetic-executor, script-execution, player-response pruner/integration ve preload ratchet hedefli kontrolleri geçti. Gerçek Electron köprü testi geçti. JS syntax, backend py_compile ve diff check geçti.
- Tam npm test, yeni start.bat üzerinden uygulama açılışı, oturumlu hesap ve uzun video reklam araları çalıştırılmadı. İlk Electron denemesi sandbox Windows IPC erişim engeli verdi; yetkili ayrı profilde tekrar koşuldu ve geçti. GPU/CUDA, kurulum dosyaları, çeviri ve dublaj ayarları değiştirilmedi. CI, kullanıcının önceki açık talimatıyla beklenmedi.
- Özel ağ kayıtları, ekran görüntüleri ve profil tmp/adblock-research altında ignore edilir; Git'e eklenmedi. İlgisiz kullanıcı dosyaları korunur.
