# Onaylanan sinematik kompozisyon → uygulama

Başlangıç master: `5bd8d6c2659df873fa5ea1ee3e4dad1c2afbb7e7`. Kullanıcı önce bağımsız Home / Keşfet / film alt v2 maketini, ardından hero / oyuncu / künye üst varyantını onayladı; son düzeltmeleri de uygulama kapsamına ekledi. Eski raporlar bu işte yeniden açılmadı.

[Maket ve gerçek Windows görüntüleri yan yana](comparison.html). [Native kabul kaydı](acceptance.json). Buradaki `approved-*` görüntüler tarihsel makettir; içlerindeki örnek yorumlar üretim verisi değildir.

## Ekran başına sonuç

- **Home:** yeni tam genişlikte hero iskeleti, yumuşak görsel geçişi, iki satırlık başlık, tek ana devam eylemi, altındaki ince ilerleme, sakin klasör/ayrıntı eylemi; gerçek medya türüne göre 16:9 video veya 2:3 afiş rafları, sağ/sol kaydırma ve gradyan baş harf yedeği.
- **Keşfet:** yeni üst kontrol şeridi, mevcut seçicileri ve isteklerini koruyan popover filtreler, kompakt izlenme sekmeleri, gerçek backdrop hero, ortak afiş ızgarası ve yükleme/boş/hata durumları. Sticky yüksekliği gerçek pencere başlığı + ortak medya çubuğuna bağlandı.
- **Film:** kütüphane ve Keşfet için aynı yeni hero / içerik ızgarası; mevcut oynatma, dosya seçme, izleneceklere ekleme ve kütüphanede açma işleyicileri taşındı. Künyede hero alanları tekrarlanmaz; gerçek kredilerden ilk dört alan, diğer mevcut bilgiler açılabilir yapım ayrıntılarıdır. Boş alan yoktur. Oyuncular TMDB kişi profil fotoğraflarıyla yuvarlak, `cover / center 20%`; ad yedeği sıcak gradyan, rol en az12px, satır taşınca yatay kayar.
- **Film altı:** kaynaklı kısa analiz özeti, gerçek gözlemlerden hesaplanan ince dağılım, gerçek kullanıcı/varsa gerçek puan/alınmış alıntı kartları; tam analiz ve bütün kaynaklar açılır ayrıntıda korunur. Benzer afişler ve görsel/fragman rafı açıktır, ilk resmî fragman daha geniştir. Zevk ve kaynak/izleme araçları aşağıdaki tutarlı açılır satırlara taşındı.

## Gerçek veri ve davranış sınırı

`cinema-ui.js/css` mevcut paletteki `--mv-*` rollerini alias olarak kullanır. Font mevcut yerel IBM Plex Sans, hareket180ms; reduced-motion korunur. Yeni paket, hesap, ücretli API veya framework yoktur. DOM'a dış metin `textContent` ile girer; CSP'ye inline çalışma kodu eklenmez.

Ana butonda uydurma `İzle` yoktur: Keşfet'te mevcut handlerın **İzleneceklere ekle / Kütüphanede aç**, dosyasız yerel eserde **Video dosyası seç**, kaynağı bağlı eserde mevcut **Oynat / Devam et** eylemi kullanılır. Dosya erişimi/oynatma doğrulamasının sahibi mevcut main servisidir. Benzer yapımların önceki “izleneceklere ekle ve aç” davranışı sessiz bir afiş tıklamasına dönüşmesin diye kartta açık işlem etiketi korunur.

Künye için mevcut `metadata-film-extras` yanıtına aynı doğrulanmış TMDB nesnesinden yazar, görüntü yönetmeni, besteci, şirket, ülke, dil ve bütçe eklendi. Depo verisi veya kullanıcı eşleşmesi değiştirilmez. Görseller mevcut TMDB kişi/film kaynaklarıdır; maketteki Wikipedia Bardem görseli uygulamaya gömülmez. Veri alınamazsa mevcut kayıt/baş harf yedeği korunur ve yeniden deneme erişilir.

Maketteki72/28 hiçbir yerde sabit değildir. Dağılım **doğrulanmış alıntılı övgü/eleştiri gözlemlerinin** oranıdır; bütün Letterboxd izleyicilerinin hissiyatı/anketi olduğu iddia edilmez. Geçerli alıntı yoksa çubuk üretilmez. Eksik puan/yazar yerine hayalî değer kullanılmaz. Spoiler kapısı, profil güncelliği, kaynak atlama, önceki analiz, iptal ve onaylı kişisel değişiklikler korunur.

## Görsel karşılaştırma ve düzeltilen farklar

1. İlk native incelemede dar film afişi düğme satırına yaklaşıyordu. Negatif boşluk yerine açık grid satırları kuruldu;480px görüntüsü tekrar incelendi.
2. Künye gereksiz yüksek kalıyordu. Hero tekrarları kaldırılıp kredi bilgileri kompaktlaştırıldı; konu genişledi, yapım ayrıntıları korunarak açılır satıra alındı.
3. Uzun kaynak özeti tekrar metin duvarına dönmesin diye kısa özet + gözlem satırları ayrıldı; tam metin ve kaynağa atlama kaybedilmedi.
4. Varsayılan blockquote arka planı, iki kat chevron, zayıf alt etiketler ve fragmanların düşey hizası düzeltildi. Yorum meta ve rol metinleri en az12px.
5. Home/Keşfet/Film yeni yapısal sınıflar kullanır; eski sayfa kabuğu korunup üstüne yalnız renk uygulanmadı. İleri form/iş sahipleri taşınarak canlı handler/draft kimlikleri tutuldu.

Kompozisyonla piksel eşitliği iddia edilmez: native pencere başlığı, gerçek başlık/özet dili, mevcut kaynak durumuna göre düğme, actual source count ve dinamik puanlar farklıdır. Onaylı hiyerarşi ve görsel aile karşılaştırıldı. Home'daki web geçmişi16:9, film afişi2:3'tür. Native görsellerdeki `Controlled source` yalnız ayrı test profilinde yerel kayıt/alıntı doğrulama hattını sınayan fixture'dır; gerçek Letterboxd çağrısı veya üretime eklenmiş içerik değildir.

## Kontroller

-63 hedefli Node testi: PASS; son kaynak etiketi değişikliğinden sonra iki dosyadaki11 kontrol ayrıca PASS (konuyu gizleme işleyicisi ve açık ileri ayarın yeniden çizimde korunması dahil). Sözdizimi, yeni CSS parser ve `git diff --check`: PASS.
- `tests/electron-cinema-design.smoke.js`: gerçek Windows main/preload/renderer, ayrı profil; Home/Keşfet/Film üst-orta-alt1440/1920, kayıtlı kontrollü analiz, kaynak vurgusu, doğru dosyasız eylem,480px film/Keşfet: PASS.16 görüntü kaydedildi.
- Mevcut `tests/electron-home-discover-design.smoke.js` güncel yapısal seçicilerle Home ve `--discover`: PASS. Hero geçişi/ilerleme, mevcut araç menüsü, toast kapatma; arama/filtre/izlenme, bulk erişimi, sticky hizası, skeleton, boş sonuç,503 sonrası yeniden deneme korunur.
- İlk Windows sandbox denemeleri süreç açarken EPERM verdi. İzinli koşular başarıyla tamamlandı. Test düzeneğindeki yanlış `details` API adı `openDetail` olarak düzeltildi; ayrı store örneği yerine gerçek save IPC kullanıldı; arkadaki Keşfet butonunu bulan genel seçici etkin film sayfasına daraltıldı. Boşluklu varlık yolunun ilk komutta ayrılması da tek argümanla düzeltilip son native kontrol yeniden başarıyla çalıştırıldı. Bunlar ürün bugı diye sayılmadı.

Tam suite, canlı Letterboxd/TMDB/AI, GPU/ses ve gerçek kullanıcı profili bu turda sınanmadı. Actions başlatılmaz; teslim `[skip ci]`. Kişisel açık uygulama kapatılmadı. `docs/OFFLINE-MANIFEST.md`, ana kopyanın rapor indeksi, silinmiş `start.sh`, `.codex/` ve kişisel untracked dosyalar teslim dışıdır.

Yeniden üretme: mevcut Electron ile `tests/electron-cinema-design.smoke.js` varsayılan kontrollü demo medyasıyla çalışır. Onaylı maketin yerel medya paketini kullanmak için `--preview-assets=<cinematic-proposal-v2 klasörü>` verilebilir. `ELECTRON_RUN_AS_NODE` kapalı olmalıdır. Test yalnız kendi `tmp/cinema-native-*` profilini kullanır.
