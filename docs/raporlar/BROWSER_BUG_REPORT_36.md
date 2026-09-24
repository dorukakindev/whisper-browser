# BROWSER BUG REPORT 36 — CEA iptal yarışı ve tam kaynak edinme değerlendirmesi

## Kapsam

16 Eylül 2026. Başlangıç: 0192a49db87b280941fdde0ed83c4b4acec17351, master.
Rapor 30'un kısmen açık kapanışları ve 33–35'in sağlayıcı sınırları incelendi.
Bütün tarihsel raporların yeniden denetlendiği iddia edilmez.

## BUG-36-01 — DOĞRULANDI, DÜZELTİLDİ

`src/browser-cea-full-capture.js`, `runOrderedCeaCapture`: döngü başında iptal
denetleniyor fakat `await pending` sonrasında denetlenmiyordu. Kullanıcı indirme
beklerken durdurduğunda geç gelen segment `consumeSegment` üzerinden decoder'a
gidiyor ve çalışan ilerleme olayı üretilebiliyordu. Ana süreç tüketicisi bu çağrıyla
`captureBrowserHlsCeaSegment` ve tamamlanan segment defterini güncelliyor.

Düzeltme: indirme yanıtı geldikten sonra, decoder çağrısından önce iptal/bağlam
geçerliliği yeniden doğrulanıyor. İptal edilmiş segment tamamlandı sayılmıyor.

Deterministik test: kontrollü bekleyen indirme başlatılır, iptal edilir, yanıt
serbest bırakılır. Tüketim ve ilerleme sayıları sıfır; tamamlanan sıfır, kalan üç.
Önceki testler yalnız sıralama, paralellik, başarısız indirme ve bütünlük ölçüyordu;
indirme beklerken iptal sırasını çalıştırmıyordu.

## BUG-36-02 — DOĞRULANDI, DÜZELTİLDİ

Ekran görüntüsü hazır altyazının oynatıcıda bulunduğunu gösteriyor. Ancak bu,
ayrı bir VTT/SRT dosyasının varlığını veya bölümün tamamının uygulamada olduğunu
kanıtlamaz. CC1 etiketi gömülü CEA olasılığıyla uyumludur; gerçek manifest bu
oturumda alınmadığından bu site için kesin format tanısı konulmadı.

Mevcut kod iki farklı yolu içeriyordu:

- Ayrı altyazı dosyası/manifest izi bulunursa tam kaynak edinilebilir.
- Gömülü CEA için `prepareBrowserHlsCeaCapture` düşük bant genişlikli varyantı
  seçip segment planını kurar; `startBrowserHlsCeaFullCapture` tüm planı işler.
  Renderer bu izi CEA olarak tanırsa iz panelinde “Tüm altyazıyı getir” gösterir.

Kök neden: manifestten CEA planı hazırlanmış olsa bile Renderer'a ancak ilk video
segmenti decode edilip `embedded-cea` izi yayımlandıktan sonra görünür oluyordu.
Sayfanın native TextTrack'i `1-CC1` / `html5-track` olarak bulunduğunda, bu iz hazır
CEA planıyla ilişkilendirilmiyordu. Bu yüzden düğme gizli kalıyor ve “Çeviri
oluştur” yalnız oynatılmış bölümden biriken birkaç cue'yu canlı çeviriye veriyordu.

Düzeltme:

- Manifest segment planı hazır olur olmaz ana süreç `ready` CEA plan olayını,
  güvenli iz kimlikleri ve segment sayısıyla yayımlar.
- Renderer native `1-CC1` izini `CC1` manifest planına dil/isim/instreamId ile
  dar kapsamlı biçimde bağlar; sıradan HTML5 altyazıları CEA saymaz.
- Eksik native izde “Çeviri oluştur” doğrudan çeviri başlatmaz. Önce bütün segment
  planını yakalar; `captureComplete` kaynak izi yayımlandıktan sonra o izi seçip
  mevcut bağlamlı toplu çeviri akışını otomatik başlatır.
- Kısmi sonuç, hata veya kullanıcı iptalinde otomatik çeviri başlamaz ve açık
  Türkçe durum mesajı gösterilir.

Önerilen akış: tam kaynak edin → segment/süre bütünlüğünü doğrula → SRT'yi kaydet
→ tamamlanmış cümle bağlamıyla toplu çevir → videoya bağla. Böylece henüz bitmemiş
canlı cümlelerin çevrilmesi gerekmez. Ayrı metin izi yoksa video segmentlerini
almanın bant genişliği maliyeti vardır; yalnız metin dosyası indirmekle aynı değildir.

Siteye özel, kırılgan endpoint tahmini eklenmedi. Düzeltme HLS manifestinde gerçekten
ilan edilmiş CEA izi ile aynı sayfadaki native CC izini bağlayan genel mekanizmadır.
Gerçek üyelik oturumunda ağ isteği çalıştırılmadığından Great Courses'ın her
bölümünde aynı formatı kullandığı iddia edilmez. Ayrı VTT/TTML sunulan bölümlerde
mevcut doğrudan metin yakalama yolu kullanılmaya devam eder.

## Rapor 30 açık kapsamı

- B46: çalışan subprocess için erken iptal kanalı hâlâ ayrı mimari iş.
- B60: bütün async üreticilerin sabit olay bağlamı taşıması bütünüyle kapanmadı.
- B64: ortak TTL/tek-kullanım mutasyon matrisi tamamlanmadı.
- B66 ve B70: main-world kuyruk/kontrol alanlarının izolasyonu açık mimari sınır.

Bu maddeler, CEA iptal düzeltmesi yapıldı diye kapatılmadı.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

Doğrulanan ilk hata indirme bekleyişindeki iptal yarışıdır; test gerçek zaman
uyutmasına değil kontrollü Promise sırasına dayanır. İkinci hata native CC izi ile
hazır manifest planı arasındaki kopukluktur. Electron smoke testi `1-CC1` native
izinin plana eşleştiğini, tam-yakalama eyleminin görünür olduğunu ve çeviri öncesi
tam edinme kararının üretildiğini doğrular. “Doğrudan tam yakalama hiç yok” iddiası
mevcut CEA planlayıcısı nedeniyle reddedildi; eksik olan bağlantı tamamlandı.
“Great Courses'ta kesin çalışıyor” iddiası gerçek oturum kanıtı olmadığı için
kurulmadı. Canlı sağlayıcı çağrısı ve kişisel profil erişimi yapılmadı. Test
sonuçları tarihli devir notundadır.
