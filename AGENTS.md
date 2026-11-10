# Çalışma kuralları

## Önce oku

- [README.md](README.md): ürün ve belge haritası. [BACKLOG.md](BACKLOG.md): açık işin durumu, dalı, kanıtı ve kesin sonraki adımı.
- Yalnız ilgili güncel devir notunu [DEVIR-NOTU.md](DEVIR-NOTU.md) indeksinden aç. Ortam/kurulum işinde [YENI-BILGISAYAR.md](YENI-BILGISAYAR.md); UI işinde [DESIGN.md](DESIGN.md) kullan.
- Mimari, komutlar, altyazı/IPC/kalıcılık ayrıntıları: [docs/WORKING_GUIDE.md](docs/WORKING_GUIDE.md). İlgili bölümü oku; bütün eski raporları her turda tarama. En yeni kullanıcı talimatı önceliklidir.

## Çalışma

- Ürün bir medya kütüphanesi, player/browser ve altyazı/dublaj/asistan bütünüdür. Mevcut özellikleri, ileri ayarları, kaynak kimliklerini ve onay kapılarını koru.
- Önce gerçek dal/HEAD/remote ve değişiklikleri kontrol et. Kullanıcı dosyalarını, profili, açık uygulamayı ve ilgisiz değişiklikleri koru; reset/clean/force push yapma.
- Anahtar/token/kişisel veriyi sohbete, argv'ye, loga veya commit'e koyma. İzole test profili kullan; canlı API yalnız mevcut yetki kapsamında. Yeni hesap/ücretli hizmet açma.
- IPC/CSP/sandbox sınırlarını koru; ayrıcalıklı erişim preload/main üzerinden. Yeni UI metinleri EN/TR; kullanıcı içeriğini arayüz çeviricisine sokma. Zaman ekseni, cache bağlamı ve kuyruğa eklenirken dondurulan seçenekler korunur.
- Bağımsız okumaları/kontrolleri grupla; sonuç bağımlı adımları sırala. Yeterli kanıt oluşunca uygula; değişmemiş dosyaları ve başarısız komutları gerekçesiz tekrarlama.
- Denetimde önce [kapsam kaydını](docs/audits/deepseek-night1000-20261027/README.md) kontrol et. Eski/yinelenen/düzelmiş bulguyu yeni bug sayma; rapor sayısı için bulgu uydurma. Rapor numarasını güncel indeksten doğrula.
- Müzik analizine yeni hedef ekleme; eski bug raporlarını kullanıcı istemeden topluca yeniden açma. Bağımlılık gerekiyorsa resmî kaynak/lisans/uyumluluk kontrolü yap; gereksiz sürüm yükseltme yapma.

## Tasarım ve doğrulama

- **Görünüm en önemli önceliktir.** Güçlü, özgün ve etkileyici tasarım hedefle. Hareket, parıltı, hover ve sürekli dekoratif animasyonun yoğunluğu tasarım ihtiyacına göre belirlenir; zorunlu sakinlik/minimalizm veya düşük hareket kuralı koyma. Tasarımcının yaratıcılığını koru; okunabilirlik, erişilebilirlik, kullanıcının hareket tercihi ve mevcut işlev/veri sınırları geçerlidir. Ayrıntı DESIGN.md’nin güncel görsel öncelik kararındadır.

- Önce tam görsel kompozisyon; gerekiyorsa kullanıcı onayı, ardından uygulama. Üst medya menüsü, grafit/amber ve sinematik player kimliği korunur; soldan genel gezinme/landing/paper tasarımına dönme. Luna kalite referansıdır; kopya değildir.
- İkincil gezinme soldaki simgenin hover/tıklama/klavye menüsünde; dar ekranda kontrolleri ezme. İleri ayarlar erişilebilir kalsın. Gerçek Windows geniş/dar görüntüsünü onaylı tasarımla karşılaştır; test geçmesini estetik başarı sayma.
- Değişen davranışa kısa, anlamlı test ve sözdizimi kontrolü yap. Belge değişiminde bağlantı/diff kontrolü yeterlidir; gereksiz tam paket/uzun test bekleme. Mock, canlı site/GPU/sağlayıcı başarısı değildir; sınırları açık yaz.
- Kullanıcının güncel tercihi: kısa hedefli kontrollerle ilerle; kendiliğinden genişlik matrisi, yüzlerce ekran çekimi, CPU/frame ölçümü veya kapsamlı kabul raporu üretme. Computer Use kullanma ve dosya erişim onay penceresi açan testleri tetikleme. Küçük görsel ayrıntılar için işi durdurup tekrar onay isteme; mevcut onaylı tasarım dilini uygula.
- Uygulama açılacaksa LG monitöründe izole profil ve gerçek 1920×1080 tam ekran kullan; OS çözünürlüğünü değiştirme, kişisel açık uygulamaya dokunma. Canlı podcast transkripsiyon/çeviri denemesi en fazla 3–4 dakika olsun. Gereksiz yeni test dosyası üretme; uygun mevcut testleri güncelle. Kullanıcı istemedikçe agent açma.
- Windows ana ortamdır: D:\Whisper Local. Normal açılış start.bat; npm start/native fixture, start.bat/CUDA/kişisel kullanım doğrulaması yerine geçmez.
- **GitHub Actions başlatma: kredi yok.** Commit/PR/merge başlıklarında [skip ci] kullan. Başarısız kabul hedefini gizleme, eşiği gevşetme veya tamamlandı deme.

## Kayıt ve teslim

- Yarım kalan/engellenen işi turn sonunda **BACKLOG.md**'ye yaz: durum, dal/PR, kanıt, kalan kabul koşulu ve tam sonraki adım. Sohbeti tek kayıt yeri yapma. Yalnız doğrulanmış biten değişikliği **CHANGELOG.md**'ye ekle.
- Her teslimde docs/devir/YYYY-MM-DD-HHMM.md oluştur ve DEVIR-NOTU.md indeksini güncelle. Başlangıç/bitiş kod kimliği, dosyalar, testler, sınırlar ve kalan işleri yaz; eski notları silme. Ürün ve belge commitlerini ayır; yalnız belge işinde ürün kodunun değişmediğini belirt.
- Doğru repo: https://github.com/dorukakindev/whisper-browser; gerçek ana dal `master`. Geliştirmeyi üçlü, anlamlı işler halinde yerelde biriktir. GitHub teslimini kısa öner ve açık commit/push/merge komutu bekle; genel “devam et/hepsini yap” Git teslimi değildir. Açık teslim komutunda güncel master'dan `codex/` dalı ve PR kullan, doğrulanmış işi birleştir ve ana kopyayı kişisel farkları koruyarak güncelle; aynı teslim için yeniden onay isteme.
- Sonuçta push/merge/yerel HEAD'i doğrula; repo, tarihli devir bağlantısı, tam uzak commit kimliği ve doğrulanmayanları kısaca bildir. Push/merge gerçekleşmeden gerçekleşti deme.
- Tamamlanan işin sonunda, kullanıcının yeniden sormasını beklemeden sıradaki yapılacak işleri kısa ve öncelikli bir listeyle ver.
