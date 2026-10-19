# Rapor456 — Çeviri arşivi ve türetilmiş SRT tutarlılığı

Tarih 2026-10-18. Başlangıç `ce11b79abd8b67f8f4e3d497c345178cd4e17b9e`.
Bitiş kod commit'i `6b71324041a448da2c41549adb59dfa14b7d9365`.
Dal `codex/browser-whisper-progress-20261014`.

Kullanıcı daha derin inceleme istedi. Bu tur ses dışındaki çeviri arşivi,
browser altyazı asset'i ve çeviri planındaki zaman normalizasyonu incelendi.
Dört doğrulanmış sorun grubu için altı regresyon testi eklendi. Önceki
raporlardaki bütün açık maddelerin kapandığı iddia edilmez.

## 456-01 — Başarısız indeks yazımı bellekte başarılı görünüyor

`BrowserTranslationArchive._saveIndex` mevcut `index.entries` dizisini disk
yazımından önce değiştiriyordu. İndeks rename'i başarısız olduğunda yeni
kayıt `hasPage`/`findPage` üzerinden bulunuyor, sonraki başarılı başka kayıt
bu başarısız girdiyi de kalıcılaştırabiliyordu. Eski kaydı değiştirme
girişiminde de bellek yeni çeviriyi gösteriyordu; disk hâlâ eski indeksteydi.

Yeni indeks ayrı nesnede hazırlanır; atomik indeks yazımı başarılı olduktan
sonra `this.index` değiştirilir. Önceki dosyaların temizliği yine indeks
commit'inden sonradır. İki hata-enjeksiyon testi eski kodda sırasıyla
`hasPage === true` ve `Yeni çeviri !== Eski çeviri` ile başarısızdı. Şimdi
başarısız kayıt görünmez, sonraki kayıtla taşınmaz, eski kayıt kullanılabilir.

Sınır: indeks commit'inden önce hazırlanmış yeni içerik dosyaları başarısız
kayıtta artık dosya olarak kalabilir; bu çalışma disk süpürme/çok dosyalı
crash transaction protokolü eklemez. Aynı içerikli metadata dosyalarının
tam transaction garantisi de iddia edilmez.

## 456-02 — Browser SRT'sinde sıfır süreli satır ve gereksiz çeviri isteği

Asset ve scheduler normalizasyonu `end >= start` kabul ediyordu. Negatif
zamanın sıfıra kırpılması, eşit başlangıç/bitiş veya milisaniyeden küçük
aralık nedeniyle SRT'de `start == end` olabiliyordu. Scheduler böyle bir
satırı ayrıca sağlayıcıya gönderebiliyordu.

İki normalizasyon yolunda da milisaniyeye yuvarlanan bitişin başlangıçtan
büyük olması aranır; taşan sayısal zaman da elenir. Negatif başlangıcı
sıfıra kırpma davranışı pozitif kalan gerçek aralıklar için korunur.
SRT üretimi ve gerçek cümle planlayıcı testleri eski kodda geçersiz satırları
içerdiği için başarısızdı; artık yalnız geçerli cue kalır. İşlemciyle tutarsız
anlık placeholder cue'nun çevrilmesi önlenir; düzelen canlı cue sonraki
güncellemede normal şekilde işlenebilir.

## 456-03 — Asset JSON'u ve var olan SRT birbirinden farklı olabiliyor

`BrowserAssetStore.getTrack` türetilmiş SRT'yi yalnız dosya yoksa kuruyordu.
Yanlış/bozuk/eski SRT varsa JSON'daki doğru cue'larla aynı asset içinde
başarılı döndürülüyordu. Özellikle yarım dosya ailesi yazımı veya dış
bozulma sonrası önizleme ile dışa aktarım farklılaşabiliyordu.

İçerik-adresli uygulama asset'inin kanonik JSON'undan beklenen SRT türetilir;
mevcut dosya uyuşmuyorsa atomik olarak onarılır. Kişisel altyazı kaynağı
veya kullanıcı editörü dosyası bu kod tarafından taranmaz; işlem yalnız
`assetPaths(assetId)` ile belirlenen uygulama önbelleğindedir. Test eski
kodda "unrelated stale subtitle" döndürüyordu, artık BOM/CRLF/Türkçe içeriği
JSON ile aynıdır. Geçerli dosya gereksiz yeniden yazılmaz.

## 456-04 — SRT onarımı başarısızsa geçici dosya kalıyor

Eski `getTrack` onarımı kendi tmp/write/rename yolundaydı; rename hatasında
catch yalnız ok:false döndürüyor, tmp'yi bırakıyordu. Ortak atomik yazıcı
kullanılarak fsync/rename ve geçici dosya temizliği tek sözleşmeye taşındı.
Test eski kodda `.tmp` kaldığını doğruladı; artık geçici dosya yok, JSON
korunuyor ve sonraki başarılı getTrack onarabiliyor.

## Doğrulama ve sınırlar

Yeni `tests/report456-regressions.test.js` içindeki altı test düzeltmelerden
önce çalıştırılıp yanlış davranış gösterdi; son durumda altısı da geçti.
Toplam 19 hedefli Node dosyası, JS sözdizimi, Python py_compile ve diff
kontrolü geçti. Liste ve komutlar devir notunda. Kalıcı kayıt bozulması ve
store dayanıklılık matrisleri ayrıca başarılıdır.

Gerçek sağlayıcı/ağ yok; kullanılan arşivler ve dosyalar geçici fixture'lardır.
Gerçek profil veya API anahtarı okunmadı. Yeni UI/dependency/şema yok.
Tam npm test, Electron smoke, start.bat/install.bat, canlı YouTube/GPU/DRM ve
hesap doğrulaması bu tur yapılmadı. CI incelemesini bırakma talimatı korundu.
