# Ürün200 — ayar onayı ve işe özel üretim seçenekleri

Temel: master `b29fc8d3` / PR734. Önceki kaynak/yorum paketi korunur.

## Ürün davranışı

- Normal tercihler ve dublaj seçenekleri, değiştireceği alanların gerçek önce/sonra değerleriyle onay kartı hazırlar. Değerler Türkçe/İngilizce okunabilir etiketlerle gösterilir. Ses için çeviri açıkken refine ve lenient etkin davranışları ayrıca anlatılır.
- Onaydan sonra yapılan manuel seçim eski kartla ezilmez. Beklenen değerler model argümanından ayrı, yetkili main→renderer paketinde taşınır; gerçek değişiklikten hemen önce de denetlenir. İlgisiz alanlardaki manuel düzenleme gereksiz yere reddedilmez.
- Eski kart yalnız yenilenebilir. Yenileme güncel değerlerle yeni bir kart hazırlar; kendiliğinden uygulamaz. Eski kart tekrar çalıştırılamaz. Yeni kart tekrar incelenip ayrı Uygula onayı gerektirir. Aynı IPC taşıması kullanılır; yeni ayrıcalıklı kanal eklenmedi.
- Başlangıçta kapalı ses aralığı ilk kez ayarlanabilir; önceki değer Seçilmedi diye gösterilir. Sonradan seçilen başka aralık yine eski kartı geçersiz kılar.
- Asistanın `start_voice_generation {sample:true}` isteği yalnız o işi örnek üretir; checkbox, aralık, gruplama ve kalıcı kalite ayarlarını değiştirmez. Sonraki `{}` güncel kalıcı seçimi kullanır. Kaynak, iptal, metin planı, örnek, gruplama veya aralık plan hazırlanırken değişirse eski istek gönderilmez.
- Yeni kart aynı sohbetin eski kartını değiştirir; sonuç metni ve başarısızlık durumu yeni karta taşınmaz. Kaynak/sohbet değişirse kart başka konuşmaya eklenmez.

## Kanıt ve sınırlar

- Main servis, renderer ve UI için hedefli testler stale/refresh/replay, kaynak değişimi, malformed beklenen değerler, undo hedefi, transport aralığında manuel değişiklik ve tüm dört dublaj gruplama seçeneğini sınar.
- Gerçek geçici disk üzerinde üretim serializer, ayar temizleme, gizli alan ayırma ve atomik kayıt kullanılarak başarılı değişiklik → başarısız undo → başarılı rollback → yeniden deneme doğrulandı. Rollback de başarısız olursa disk/UI ayrılığı açık hata olarak kalır; gizlenmez ve eski undo geçerli sayılmaz. Bu mevcut davranış yeni hata diye sunulmadı.
- `settings-native.json`: gerçek Windows main/preload/overlay ve kontrollü HTTP/SSE sağlayıcıyla kart oluşturma, insanın tema değişikliği, stale ret, yenileme, eski kartı reddetme, ayrı onay ve diskten kayıt doğrulaması. Model yanıtı sentetik fikstürdür; canlı sağlayıcı değildir.
- `voice-options-native.json`: gerçek Windows renderer/preload/IPC; kontrollü job sınırında örnek true ardından normal false, başarısız planla üçüncü işin gönderilmemesi ve 5–25 sn aralığının korunması. GPU/akustik kalite kanıtı değildir.
- Ekran görüntüleri gerçek test penceresinden gözle incelendi. Kişisel profil/anahtar kullanılmadı ve açık uygulama kapatılmadı.
- Başlangıç native testlerinde sandbox erişim sorunu ve iki fixture alan beklentisi düzeltildi; son yetkili native koşular 0 çıktı. Test eşiği gevşetilmedi.
- Son birleşik yerel sonuç `validation.json` içinde; CI arka planda devam eder.

P022 genel işe özel ayarların tamamı bitmiş sayılmadı: bu pakette ses başlangıcının mevcut sample argümanı düzeltildi; yeni range başlangıç argümanı eklenmedi. Range, mevcut açık configure aracıyla bilinçli kalıcı seçimdir. Ücretli model/GPU/insan dinlemesi yapılmadığından onlara ilişkin başarı iddiası yok.

## Son geri alma onarımı

Normal tercih geri-alma kartı da artık onaylanan tam dönüş hedefini saklar. Arada başka bir asistan değişikliğiyle geri alma geçmişi değişirse, ekrandaki değerler aynı kalsa bile eski kart başka işlemi geri alamaz. Gerçek değişen alan altkümesi görünür ve geri alınır.

Son doğrulama: 722 Node + 171 Python dosyalı tam yerel koşu geçti ve koşu boyunca kaynaklar sabitti. Ardından yukarıdaki dar geri-alma hedefi uzantısı eklendi; 11 ilgili dosyanın birleşik hedefli koşusu 120/120 geçti (iki salt ratchet dosyası test-runner sayımına dahildir). Bu uzantıdan sonra tam npm test yeniden koşulmadı; final kapsamı validation.json içinde ayrı kaydedildi. Tüm değişen JS dosyalarının syntax ve UTF-8 kontrolleri geçti.
