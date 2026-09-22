# BROWSER BUG REPORT 52 — Uzun süren çeviride görünmez fallback zinciri

Tarih: 2026-09-16
Durum: **DOĞRULANDI VE DÜZELTİLDİ**

## Ayrıntılı bulgu

Kullanıcı günlüğünde işlem donmuş görünmesine rağmen süreç çalışıyordu:

- İş açıkça `2 aşama` olarak başlatıldı.
- Birinci aşama, 0–600 saniyelik 171 bloktu. Çeviri 15:58:22'de başladı ve 16:03:33'te bitti: yalnız çeviri yaklaşık 5 dakika 11 saniye sürdü.
- Bu aşamada iki toplu yanıt “geçersiz” sayıldı ve cümleler tek tek yeniden denendi.
- İkinci aşama, 600–1306 saniyelik 225 bloktu. Çeviri 16:03:59'da başladı; 16:05:34, 16:05:50, 16:06:49 ve 16:07:16'da dört ayrı toplu yanıt yeniden tekil fallback'e düştü.

Dolayısıyla görülen durum sonsuz döngü veya tamamlanan çevirinin baştan başlaması değildi. Aynı videonun ikinci zaman aralığı işleniyor, CodeCraft toplu yanıtları cümle protokolünden geçmeyince büyük paketlerdeki cümle grupları seri tekil isteklere dönüşüyordu.

## Kök neden

1. `task_once`, sağlayıcı yanıtında hiçbir geçerli cümle grubu bulamazsa yalnız `Yanitta eksiksiz ve tutarli bir cumle grubu bulunamadi` hatası veriyordu. Eksik `items`, eksik `sentences`, boş part, birleşmeyen partlar, kaynak yankısı ve sayı kapısı birbirinden ayrılmıyordu.
2. 20 blokluk paket tümden geçersizse `retry_groups_once`, paketteki her cümle grubunu sırayla tek başına çağırıyordu.
3. Bir fallback zinciri bitmeden ana ilerleme sayacı güncellenmediği için arayüz dakikalarca hareketsiz görünebiliyordu.
4. İş sonunda kaç toplu ve kaç kurtarma isteği harcandığı görünmüyordu.

## Düzeltme

- Cümle yanıtına metin sızdırmayan kesin ret kodları eklendi:
  - `kok_nesne_degil`
  - `items_nesne_degil`
  - `sentences_nesne_degil`
  - `eksik_part:N`
  - `bos_veya_gecersiz_part`
  - `eksik_tam_cumle`
  - `partlar_tam_cumleyi_olusturmuyor`
  - `kaynak_yankisi`
  - `anlam_number_mismatch`
- Tüm toplu yanıt bozuksa cümle grupları önce ikili küçük paketlerle deneniyor; ikili paket de geçersizse ancak o zaman tek gruba düşülüyor.
- Toplu yanıtta yalnız bazı gruplar eksikse, eksik olduğu zaten bilinen gruplar doğrudan tekil deneniyor; gereksiz ikili ara tur yapılmıyor.
- Her kurtarma zinciri başlangıçta grup/blok/paket sayısını, ilerledikçe işlenen grup, kurtarılan blok ve süreyi yazıyor.
- Arayüz durumuna `Çeviri kurtarılıyor: X/Y cümle grubu · N blok hazır` bilgisi gönderiliyor.
- İş sonunda `toplu + kurtarma = toplam istek`, geçersiz toplu yanıt sayısı ve toplam süre yazılıyor.

## Ret gerekçeleri

- **Kalite kapılarını gevşetmek reddedildi:** daha hızlı görünür fakat eksik, kaynak-yankısı veya sayı kaydırılmış çeviriyi başarılı sayar.
- **Fallback'i tamamen kaldırmak reddedildi:** tek bir bozuk toplu yanıt bütün 20 bloğu İngilizce bırakabilir.
- **Bütün tekil fallback'leri aynı anda paralelleştirmek reddedildi:** sağlayıcı kota/rate-limit patlaması ve gereksiz token tekrarına yol açabilir.
- **Yalnız daha fazla genel log eklemek reddedildi:** kök nedeni göstermeyen satır kalabalığı sorunu çözmez. Tanı, yapısal ret kodu ve istek kimliği düzeyinde tutuldu.

## Doğrulama dökümü

### Deterministik fallback ölçümü

Altı bağımsız cümleli sentetik sağlayıcı, 2 bloktan büyük isteği bilinçli olarak geçersiz saydı:

- Eski davranış: 1 toplu + 6 tekil = 7 istek.
- Yeni davranış: 1 toplu + 3 ikili küçük paket = 4 istek.
- Aynı 6/6 blok çevrildi; istek sayısı bu senaryoda yaklaşık %43 azaldı.

İki grupluk paketin ikili halde de başarısız olduğu ayrı testte zincir deterministik olarak `[2, 1, 1]` istek boyutlarıyla sona erdi; sonsuz retry oluşmadı.

Kısmi yanıtta yalnız eksik grupların yeniden gönderildiği 25-cümle ölçek testi de geçti.

### Otomatik kontroller

- Hedefli dört Python regresyonu — geçti.
- Python sözdizimi — geçti.
- `npm test` — geçti; Python backend 181/181, bütün paket yeşil.
- `npm run test:electron-bridge` — geçti.
- Görünür kurtarma durumu eklendikten sonraki hedefli regresyonlar — tekrar geçti.
- `git diff --check` — geçti.

## Sınırlar

- Paylaşılan günlükteki gerçek sağlayıcı yanıt gövdesi eski sürüm tarafından saklanmadığı için geçmiş dört ret olayının hangisinin `eksik_part`, `eksik_tam_cumle` veya başka bir kod olduğu geriye dönük kesinleştirilemez.
- Yeni sürüm bir sonraki gerçek olayda nedeni açıkça gösterecektir.
- Canlı CodeCraft çağrısı bu düzeltme sırasında tekrar yapılmadı; hız kazancı kontrollü sağlayıcı regresyonunda ölçüldü. Gerçek hız sağlayıcının yanıt süresi ve geçerlilik oranına bağlıdır.
