# Rapor 680 — Web geçmişi için gerçek video kartları

Başlangıç master `f4ca14eeca67d8ab8b9e0108a81305a274d9c715`; ürün bitiş `3bd6fb2c25d726ea3f363cd4aa836d619816d420`; dal codex/web-artwork680.

## Neden kötü görünüyordu?

Web sayfası film kütüphanesiyle aynı dikey 2:3 kartları kullanıyordu. Resim yükleme temelinde YouTube kimliği zaten vardı, ancak yalnız hqdefault/mqdefault deneniyor; bulunamayan kapaklar büyük film simgesi bırakıyordu. Bu nedenle kapak mevcut olduğunda bile yanlış oranda görünüyordu; her kayıt için hiç resim kaynağı yok iddiası doğru değildir.

## Değişiklikler

- Web kartları ayrı `mh-web-grid` içinde en az 280 px genişlikli 16:9 kutulara taşındı. Dar ekranda kolon sayısı doğal azalır; iki satıra kadar başlık, ortak metadata/progress hizası.
- Video resmi `object-fit:cover; object-position:center` ile oranı bozmadan doldurulur. 4:3 YouTube hqdefault paketindeki siyah üst/alt alan merkezden 16:9 kırpılarak kaldırılır; 16:9 yüksek kaliteli resim doğrudan kullanılır.
- YouTube için sırayla hq720 → hqdefault → mqdefault denenir. İlk istek sonucu hata veya 120 px jenerik eksik görsel olduğunda sonraki aday denenir. Uydurulmuş resim veya AI kapak yok. Video kimliği yalnız doğrulanmış YouTube URL/kimliğinden türetilir.
- Web geçmişindeki kaydın kataloğa bağlı film posteri olsa bile gerçek YouTube kapağı varsa öncelik video kapağındadır.
- Resmi bulunamayan Web kayıtları silinmez; kart dizisinin altında tam genişlikte küçük başlık/ilerleme satırı olarak gösterilir. Büyük boş afiş ve bozuk img bırakılmaz. Ana sayfanın artwork-only kuralı korunur.

Dosyalar `src/renderer/media-home.js`, `media-home.css`, yeni `tests/electron-web680.smoke.js`. Yeni IPC, schema, paket yok. make-interfaces-feel-better rehberi ve [MDN object-fit](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/object-fit) center/cover davranışı incelendi; paket veya dış kod alınmadı. Mevcut resim motoru kullanıldı.

## Kanıtlar

9 hedefli Node kontrolü PASS: media-home-model ve design-system. JS syntax/diff kontrolü PASS. Native Windows Electron ayrı profil testi: 1280×720 kontrollü kapak, üçüncü adaya düşen kapak ve 120×90 jenerik kayıp görsel; gerçek kart oranı 16:9, objectPosition center, objectFit cover, dar görünüm yatay taşma yok. `--live` ile protocol interception kaldırıldı; jNQXAC9IVRw halka açık YouTube kapağı naturalWidth>120 ile yüklendi, görüntüsü tek tek incelendi. Önceki kontrollü resimlerin tarayıcı önbelleğinde kalması normaldir; canlı kanıt yalnız bu ek kimliğe aittir. Tüm YouTube videolarının kapak kalitesi garanti edilmez; kaynağın sağladığı çözünürlük sınırdır.

[Geniş](WEB680_2026-10-28/web-wide.png) · [dar](WEB680_2026-10-28/web-narrow.png) · [canlı halka açık YouTube kapağı](WEB680_2026-10-28/web-live.png) · [ölçümler](WEB680_2026-10-28/result.json). Geniş/dar ve canlı görüntüler incelendi; kişisel geçmiş/profile ait veri yok. Testteki renkli degrade sentetik fixture'dır, ürünün gerçek kapağı değildir.

start.bat/install.bat/backend/GPU değişmedi; temiz start.bat, DRM, video playback, kişisel hesap ve bütün site OG kapakları doğrulanmadı. YouTube dışı sayfalarda mevcut katalog posteri varsa kullanılır; keyfi sayfaları otomatik tarayarak kapak toplama eklenmedi. Tam npm test/CI beklenmedi, yeşil iddiası yok. Mevcut before-quit 11 listener uyarısı sürüyor; gizlenmedi. Kişisel uygulama kapatılmaz, yeni kod tekrar açılışta gelir.
