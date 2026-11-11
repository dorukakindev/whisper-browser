# Claude'a görev hazırlama ve teslim rehberi

Kullanıcı talimatı · 2026-11-10. Bu belge Claude için görev promptu hazırlayan asistana yöneliktir. Claude'un iç çalışma biçimi hakkında varsayım değil, bu proje için istenen görev verme ve çalışma sözleşmesidir.

## Önce güncel belgelerden görev çıkar

- README.md ile ürün ve belge haritasını, BACKLOG.md ile açık iş ve kabul koşullarını, DEVIR-NOTU.md indeksinden yalnız ilgili en güncel devri oku. UI için DESIGN.md, teknik ayrıntı için docs/WORKING_GUIDE.md'nin ilgili bölümünü kullan.
- Gerçek dal/HEAD ve yerel değişiklikleri kontrol et. Eski sohbet sayıları, önceki teslim veya plan maddesi güncel tamamlanma durumu sayılmaz. Başka sohbet çalışıyorsa onun değişikliklerini koru; aynı dosya ve kişisel veride eşzamanlı yazma yaratma.
- İşi somut kullanıcı ihtiyacından tanımla: mevcut davranış, beklenen davranış ve gözlenebilir bitiş koşulu. Daha önce tamamlanmış iş, araştırma fikri ve doğrulanmış bug birbirinden ayrı olsun.
- Birbirine bağlı işleri anlamlı bir grupta ver. Sayıyı doldurmak için bağımsız büyük iş yığma; gerekli bağlantılı değişikliği de kapsam dışında bıraktırma. Bu projede üçlü gruplar varsayılan kullanıcı tercihidir, teknik gereklilik değildir.

## Promptu nasıl sun

Tek parça, doğrudan kopyalanabilir prompt ver. Claude'a yönelik talimatları açıklama parçaları arasında dağıtma.

Aynı devam eden yerel Whisper sohbetinde doğrudan görev, kapsam ve varsa kullanıcı tarafından seçilmiş model/eforla başla. Repo URL'si, baştan kurulum ve eski devir bilgisini gereksiz tekrar etme. Yeni sohbet veya ayrı ortam için bağımsız çalışmaya yeterli ürün, mimari, ortam ve başlangıç bilgisi ekle. İstenen model/efor verilmediyse kullanıcı seçmiş gibi model adı uydurma.

Prompt sırası:

1. **Görev ve sonuç:** Kullanıcının ne yapabilmesi gerektiği; mevcut sorun ve hedef davranış.
2. **Güncel bağlam:** İlgili belgeler, başlangıç kod kimliği, mevcut uygulama parçaları, tamamlananlar ve açık belirsizlikler. Yalnız o görevle ilgili dosyaları ver; tüm rapor arşivini okutma.
3. **Kapsam ve uygulama:** Somut işler, bağımlılıklar ve korunacak veri/özellik sınırları. Kodu değiştirmeden yalnız raporla bitirmesin; bulunan gerçek hata doğrulanıp düzeltilsin.
4. **Kabul ve doğrulama:** Gözlenebilir bitiş koşulları, değişen davranışa hedefli testler; kontrollü fixture, canlı sağlayıcı ve GPU kabulü ayrı raporlansın. Gerçek hatayı gizlemek veya eşiği gevşetmek yasak.
5. **Teslim biçimi:** Ortamın gerçekten desteklediği indirilebilir ara dosyalar; değişen dosyalar ve taban sürümü belli olsun. Paketler kümülatif mi yalnız son dilim mi açık yazılsın. Nihai teslimde değişiklikler, doğrulama ve kalan sınırlar olsun. Yerel proje belgelerine durum kaydedilsin; sonraki üç somut öncelik sunulsun.
6. **Yetki sınırları:** Kişisel veri, açık uygulama, ağ/sağlayıcı ve Git yetkisi göreve göre açıkça belirt. Ortamda olmayan Windows yolu, GPU, araç veya canlı hesaba erişimi varmış gibi davranmasını isteme. Eksik erişimde yapılabilen işi sürdürüp sınırı bildirsin. Yeni commit/push/merge açık talimat gerektirir.
7. **Aşağıdaki kalıcı çalışma bloğunu eksiksiz ekle.** Ara teslim sonrası durma, yeni komut bekleme veya yalnız planla bitirme talimatı verme.

## Claude görev promptunun sonuna eklenecek tam blok

- Görevi eksiksiz tamamla ve değişiklikleri çalışma boyunca indirilebilir ara teslimlerle güvenceye al. Araç limitini önceden görebildiğini varsayma ve uyarıyı bekleme. Ara dosyayı sunduktan sonra yeni komut veya onay beklemeden devam et.
- İlk çağrıdan itibaren güvenle birleştirilebilen işlemleri grupla. Ortamı, paket dosyalarını, komutları, testleri, kabuğu ve araçları birlikte tanı. Gereksiz kurulumları tekrarlama. Göreve özel çalışma ve log yolları kullan.
- İlgili okumaları, aramaları ve bağımsız kontrolleri aynı çağrıya veya kısa bir betiğe topla. Sonuca bağlı işleri sıralı yap. Ayrı çağrıyı önceki sonuca göre karar, hata teşhisi, çıktı sınırı veya doğrulama gerektiriyorsa aç.
- Güvenilir komutlar çalıştır. Karmaşık tırnaklar yerine gerektiğinde kısa betik kullan. Her alt işlemin çıkış kodunu ve hatasını koru. Komut zincirinde hangi adımların gerçekten çalıştığını denetle. Hataları gizleme, çıktıyı taşırma ve nedenini düzeltmeden aynı denemeyi tekrarlama.
- İncelemeyi somut belirsizliklere bağla. Değişmemiş dosyaları gerekçesiz tekrar okuma. Yeterli kanıt oluşunca uygula, bağlantılı değişiklikleri tamamla ve kapsamı sessizce daraltma.
- Engeli teşhis et, izinli alternatifleri dene ve bağımsız işlere devam et. Eksik girdi veya erişim gerekiyorsa somut yaz. Denenen, tamamlanan ve doğrulanan işleri ayrı bildir.
- Rutin adımlar için yeniden onay bekleme. Ara teslim, işin sonu değildir. Gerçek engel yoksa yalnız plan veya kalan iş listesiyle bitirme. Çağrı sayısı hedefi uğruna kapsamı, kaliteyi veya doğrulamayı azaltma.

## Güncel görev türü ve paket birleştirme notu · 2026-11-11

- Yalnız inceleme/öneri görevinde kod değiştirme veya Git teslimi isteme; yukarıdaki uygulama maddeleri uygulama görevi içindir. Yeni sohbetin kısa ürün/mimari/çalışma bağlamı [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).
- Kümülatif/artımlı paket, BASE.json hash ve LF/CRLF kuralını doğrula; çakışan mevcut kodu körlemesine kopyalama. Mevcut değerli düzeltmeler, kişisel farklar ve test sözleşmeleri korunur. Eksik test/ara teslim açık yazılır; paket hazır olması entegrasyonun tamamlandığı anlamına gelmez.
- Agent kullanımı yetkili; dosya sahipliğini ayır, nihai entegrasyon/doğrulama ana asistandadır. High/medium somut işe göre seçilir, topluca high varsayılmaz.
