# Rapor540 — Letterboxd yorumları ve kanıta dayalı kişisel uygunluk

25 Ekim2026. Repo whisper-browser, dal codex/luna-media-home532, PR482. Başlangıç0a44baeb761725f69265d44b52e2c2330418d93a, bitiş kod7e8d4fb8acdf0274f638899363c404d4463155b1. Başlangıç temiz; ana master ve kişisel profil değiştirilmedi.

## Mevcut özellik ve canlı sınır

Film ayrıntısı → Yorumlar ve bana uygunluğu → Yorumlar ve karar: açık Letterboxd film yorumları URL'siyle getir; TXT/JSON içe aktar veya yapıştır; spoiler seç; örneği incele; ortak AI modeliyle analiz et; birebir alıntıları doğruladıktan sonra kaydet. Kişinin kendi Letterboxd CSV/ZIP yorumlarını zevk profiline aktarması ayrı akıştır. Her ikisi zaten vardı; bu tur yeniden eklenmiş gibi sayılmadı.

Resmî GitHub commit API kontrolünde Luna main hâlâ189a4e99b2a3b1e102ceab15d0fd9dd2a6ac01c4, commit tarihi2026-10-24T19:07:50Z. [Önceki karşılaştırma ve üç alınan özellik](BROWSER_BUG_REPORT_539.md) güncel: izleme ülkesi, benzerler, yorum arama. Tüm Luna yenilikleri alınmış değildir. Yerel Tauri/SQLite/Foliate/Syncplay vb. çalışma bu tur yapılmadı.

Canlı anonim HTTPS isteği `https://letterboxd.com/film/the-matrix/reviews/` bu makineden **HTTP403** döndürdü. Web aracının sayfayı okuyabilmesi uygulamanın aynı erişime sahip olduğunu kanıtlamaz. Koruma aşımı, cookie/oturum devralma veya farklı kimlikle yeniden deneme yapılmadı. Otomatik çekme bugün doğrulanmış başarılı sayılmaz; normal sayfa açma ve yapıştırma/içe aktarma alternatifi açıkça gösterilir.

## Doğrulanan kusurlar ve iyileştirmeler

- İlk `</div>` ile biten eski regex iç içe bölümlerde yorum sonunu kesiyordu. Sınırlı, kod çalıştırmayan okuyucu eşleşen div/section kapanışına kadar okur; script/style/template/yorum blokları tarama öncesi çıkarılır. Beklenmeyen kırık kapsayıcıda fail-closed durur. Bu tam genel HTML ayrıştırıcısı veya tüm gelecek Letterboxd şemalarına destek iddiası değildir.
- Önceki500karakterde genel spoiler kelimesi aramak komşu yorumu yanlışlıkla spoiler sayabiliyordu. İşaret yalnız geçerli kart/body'nin bilinen class/data alanlarından okunur; gövdedeki spoiler-warning da desteklenir. Kimlikler ve doğrulanabilir alıntılar korunur.
- Sayısal/entity karakterler eksik çözümleniyordu; bazıları iki kez decode olabiliyordu. Bir kez decode, Unicode scalar doğrulama, paragraf sınırları ve bulunan yazar/başlık bilgisi eklendi. Çıktı HTML olarak çalıştırılmaz. Kaydedilen analiz alıntıları yorum kimliği/yazarıyla gösterilir.
-50×4000karakterlik çekim, arayüzün120000karakterlik içe aktarma sınırını aşabiliyordu. JSON kaçışlarını da sayan110000karakter üst sınırı ve kısaltıldı bilgisi vardır. Mevcut20sn/3MB ağ sınırı/izinli host/redirect reddi korunur.
- Eski örnekleme ilk uzun yorum4500JSONkaraktere sığmazsa boş örnek hatası veriyordu. Sınırlı parça alır, gönderilen/dışarıda/kısaltılan yorum sayısını açıkça gösterir. Bu örneğin bütün izleyicileri temsil etmediği belirtilir. Yanlış film yorumlarına karşı gönderim öncesi yapım/yıl onayı gerekir.
- Kişisel uygunluk analizine yalnız tercih kontrol değerleri gidiyordu; varsayılan3/5 değerler açık kullanıcı seçimi gibi görünüyordu. `preferencesConfigured` artık gerçek kayıt durumunu belirtir; varsayılanlar kişisel tercih diye gönderilmez. Onaylanmış kişisel profil analizi varsa sınırlı özeti/çıkarımları ayrı etiketle eklenir. Bütün kişisel yorumlar otomatik gönderilmez. Başlık, profil ve yorum örneği toplamı8000karakterlik kaynak sınırına sığacak şekilde bütçelenir, gönderim öncesi aynı veri önizlenir.
- HTTP403 ve iptal sonrası iş kilidi serbest bırakılır; erişim hatasında otomatik tekrar bombardımanı olmaz. Sayfa değişiminde geç profil sonucu eski modalı doldurmaz.

## Testler ve gerçek model denemesi

`node --test --experimental-test-isolation=none tests/letterboxd-reviews.test.js tests/media-tools.test.js tests/media-taste.test.js`: **17geçti**;6yeni okuyucu/örnek/profil kontrolü, mevcut medya testleri,403 kilit kontrolü ve profil varsayılan regresyonu. JS syntax/diff geçti.

Gerçek Windows `electron tests/electron-media-tools.smoke.js` son kodla geçti: onaysız örnek AI çağırmıyor, onay sonrası kontrollü analiz doğrulanıp saklanıyor; taslak/tab, puan, kalan süre, sağlık/yedek/dinleme ve700px koyu/940px açık ekranlar korunuyor. Son kanıt `.uiprev/media-tools/1792878504679-25872/`; native görseller okunarak incelendi. Fixture sonucu gerçek Letterboxd erişimi veya canlı model diye sunulmadı.

Ayrı test profilinde kayıtlı OpenAI **gpt-5.4-mini** ile bize ait3sentetik yorum kullanılarak gerçek üretim analiz/önizleme/doğrula/kaydet akışı tamamlandı.3alıntı özgün kaynaklarla birebir eşleşti. Sonuç açık tercih bulunmadığını söyleyip koşullu uygunluk verdi. Son kanıt `.uiprev/reviews-analysis-live-1792878457054/results.json`; önceki tur `.uiprev/reviews-analysis-live-1792878319842/` kişisel varsayılan ayrımını geliştirmeden önceki ölçümdür. Gerçek Letterboxd yorumları canlı AI'ya gönderilmedi; site403nedeniyle bu birleşik canlı yol hâlâ doğrulanmadı. Ücret/usage sayısı ölçülmedi; sınırsız kalite iddiası yok.

Ara geliştirmede prompt içindeki kaçırılmamış apostrof syntax kontrolüne takıldı; giderildi. O kodla başlatılan bir probe tools-timeout verdi ve başarı sayılmadı. Son syntax, Windows ve gerçek model denemeleri yeniden geçti. Ham kişisel profil/API anahtarı/PNG/HTML Git'e alınmadı.

Yeni bağımlılık/model/kurulum/start.bat değişikliği veya disk şema migrasyonu yok. Eski kayıtlar korunur; profile API'ye preferencesConfigured boolean eklenir. Tam npmtest/CI, yeni normal start.bat açılışı, gerçek Letterboxd oturumu/erişimi, GPU/DRM/TTS bu tur doğrulanmadı; CI açık ve beklenmez.
