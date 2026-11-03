# Aktif görsel yön ve onay kapısı

Kullanıcının son AMBITION AND MOTION BRIEF'i Home / Keşfet / film detayının mevcut kompozisyonuna eklenir. Bundan sonraki RSS, kütüphane, browser ve altyazı yüzeylerinde de aynı dil uygulanır. Son talep gereği önce hareketli bağımsız HTML ve görüntüler sunulur; kullanıcı onayı gelmeden uygulamaya yeni entegrasyon yapılmaz.

## Kimlik

- Kişisel sinema merkezi: kütüphane, keşif, yorum, altyazı ve okuma akışları aynı ürünün parçaları.
- Apple TV / Infuse / Arc / Letterboxd kalite çıtası; Luna kopyası veya landing-page dili değil.
- Grafit ve sıcak nötr yüzey, az kullanılan marka altını; görselden örneklenen ve önbelleklenen baskın renk atmosferi. Metin sürekli yeterli koyu gradyan üzerinde.
- Çok duraklı yumuşak hero gradyanı, vinyet, %2–4 grain. Posterler 2:3; temiz baş harf ve deterministik sıcak yedek.
- Güçlü tipografi: 44–96px clamp sınırları, sıkı tracking, küçük geniş aralıklı eyebrow, tabular sayı. Maksimum içerik genişliği ve ortak hizalar.
- Cam üst çubuk; hero geçilince daha opak. Katmanlı yüzey, büyük yumuşak gölge, ince iç vurgu.

## Ortak sistem

Renk / ambient slot, 4–8 boşluk, radius, glow/shadow, type ve motion tokenları önce tanımlanır. Hero, 2:3 / 16:9 medya kartı, ok/fade rafı, başlık, chip, segment, erişilebilir tooltip ikon, akordeon, toast, boş/yükleme durumları sonraki ekranlara da taşınabilecek aynı parçalardır. Gerçek işlevin sahibi mevcut olay / veri / ID / onay katmanıdır.

## Hareket

- 120 / 200 / 320 / 600 / 900ms; expo giriş, cubic geçiş, sıçramayan yumuşak hover eğrisi; 40–60ms stagger.
- 20s 1.00→1.06 Ken Burns; hafif scroll parallax ve hero fade/blur; 800ms carousel crossfade ve aktif nokta ilerlemesi.
- Bir defalık section reveal; sticky filtreye yalnız yapıştığında blur/gölge.
- Kart hover -6px / 1.03, baskın renk glow, tek shine sweep, hızlı eylem overlay, blur-up / skeleton.
- Native ortak afiş View Transitions / FLIP; geri dönüşte ters hareket, destek yoksa 200ms fade.
- Film girişinde afiş/başlık/meta, 40ms aralıklı .9→1 oyuncu girişi. Akordeon chevron ve içerik hareketi.
- .97 press, sakin hover glow, kısa tooltip fade, kayan segment göstergesi. Menü/toast slidefade, toast süre çizgisi.
- Boş/yüklemede sakin görsel hareket; boş sayfada tek spinner yok.

## Sınırlar

Transform / opacity önceliklidir; filter yalnız gerekli küçük hero katmanında. Her karede layout ölçümü yoktur; will-change yalnız gerekli anda. Grain durağan render edilir. Okunan metnin yanında sürekli döngü yoktur. Hero görünmezken veya pencere arka plandayken hareket durur. Reduced-motion Ken Burns/parallax/stagger'ı kapatır, basit fade tutar. Hedef60fps; ölçmeden sağlandı denmez.

Ücretli servis, hesap ve gereksiz bağımlılık yok. Yeni kullanıcı metni Türkçe. Eksik token / düşük çözünürlük gibi sınırlar açık söylenir. Örnek yorumlar kişisel veya gerçek kaynak verisi gibi üretime taşınmaz.

## Onay sonrası kabul

Gerçek Electron uygulamasında 1440 / 1920 Home, Keşfet, film üst/orta/alt; TMDB bağlı/bağlı değil; hero geçişi, hover, ortak afiş geçişi, akordeon zaman kareleri. Görüntü ve etkileşim onaylı maketle karşılaştırılacak. Tasarımın düz/generic/kırık kalan kısmı düzeltilmeden tamamlandı denmeyecek. Mevcut maket yakalamaları bu gelecek native kabulün yerine sayılmaz.
