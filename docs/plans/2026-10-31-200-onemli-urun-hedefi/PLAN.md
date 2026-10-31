# 200 önemli ürün hedefi

31 Ekim 2026 · başlangıç master `206fac90` · durum: uygulama aktif; ilk paket kaynak/sohbet/yorum akışları.

En büyük pay asistana ayrıldı. Yeni yerel LLM, müzik analizi genişletmesi veya ağır yedekleme paketi bu kapsamda yok. Mevcut Whisper/VoxCPM2 ve kullanıcı seçimleri korunacak.

**Bunlar 200 doğrulanmış bug değildir.** Her maddede mevcut temeli geliştirme, yeni uzantı veya önce davranışı doğrulama ayrımı var. Önce-doğrula maddesi zaten doğruysa tamamlanmış kanıt olarak kaydedilecek; sayı doldurmak için kod değiştirilmez.

Her teslimde gerçek sağlayıcı, fixture, GPU, native arayüz ve insan dinlemesi kanıtları ayrı tutulur. Kullanıcı arayüzüne bu 200 görev için 200 yeni ayar eklenmez; uygun iyileştirmeler mevcut sade varsayılana bağlanır.

DeepInfra model testi: `deepseek-ai/DeepSeek-V4.1-Flash-1017`; normalde standard, çok büyük toplu denemelerde Flex. API anahtarları bu dosyada bulunmaz. Yardımcı ajanlar: GPT-6.1 Sol / medium.

Kullanıcı listeyi gördü ve uygulamayı onayladı; işler somut görev paketleriyle ilerliyor. Uzun CI beklenmez; anlamlı yerel kontroller tamamlanır. Kişisel dosyalar ve açık uygulama korunur.

## Asistan — P001–P070 (70)

Kod dayanağı: `src/assistant-capabilities.js; src/assistant-agent-service.js; src/assistant-context-manifest.js; src/renderer/assistant-workspace.js`.

### P001 — Bağlı kaynak, dil ve seçili aralığı gönderim öncesinde açık göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Gönderilecek gerçek kapsam görünür olsun.
- Durum: Uygulandı — native Windows ve birim kontrolleri. Kaynak, altyazı dili ve soru kapsamı görünür; yeni Whisper işlem aralığı sorunun kapsamından ayrıdır. Üç native boyut/tema.

### P002 — Uzun kaynakta gerçekten okunan ve dışarıda kalan bölümleri ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Örnekleme tam okuma diye sunulmasın.
- Durum: Uygulandı — kontrollü veriyle doğrulandı. Sağlanan/kullanılan/dışarıda bırakılan metin ve birim sayıları, bilinmeyen önceki kırpılma ve bütçe sonrası güncel kapsam. Modelin tüm kaynağı okuduğu iddia edilmez.

### P003 — Birden fazla açık kaynaktan hangisinin kullanılacağını anlaşılır seçtir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yanlış sekme veya eser kullanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P004 — Kaynak değiştiğinde eski sohbet bilgisinin yeni kaynağa sızmasını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Geç yanıt yeni kaynağı sahiplenmesin.
- Durum: Uygulandı — deterministik sahiplik kontrolleri. Eski kaynağın geç yanıtı yalnız kendi sohbetinde saklanır; bitmiş, temizlenmiş, silinmiş veya başka işçe devam ettirilmiş yanıta yazamaz.

### P005 — Uzun videoda soruyla ilgili bölümü ikinci aramayla getirebil.

- Tür: Mevcut temeli geliştirme.
- Kabul: İlk örneklemede kaçan cümle bulunabilsin.
- Durum: Uygulandı — gerçek ana süreç/renderer taşıma sözleşmesi kontrollü testte. İkinci arama ilk örnek havuzunu değil uygun tam altyazıyı tarar. 6000+ satırda ilk örnekte olmayan U3997 bulundu, seek/editor bağlantıları doğrulandı. Canlı sağlayıcı denemesi henüz yok.

### P006 — Zaman içindeki fikir değişimini birden fazla sahneyle kanıtla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Alıntılar farklı doğru zamanlara gitsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P007 — PDF ve kitap alıntılarında sayfa, bölüm ve eser kimliğini birlikte koru.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Alıntı doğru okuma konumunu açsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P008 — Seçili pasajla bütün kaynak sorularını daha doğru ayırt et.

- Tür: Mevcut temeli geliştirme.
- Kabul: Pasaj seçimi bütün kitabı temsil etmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P009 — “Az önceki film/bu cümle/diğeri” ifadelerini konuşma bağlamına bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Çok adımlı konuşmada hedef karışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P010 — Kaynak bilgisi ile internetten bulunan bilgiyi yanıtta ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Her iddianın dayanağı anlaşılabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P011 — Türkçe ekler, ad varyantları ve yazım hatalarıyla kaynak aramasını geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kontrollü genişletme yanlış eşleşmeyi artırmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P012 — Eksik bağlamda tek ve işe yarar netleştirme sorusu üret.

- Tür: Mevcut temeli geliştirme.
- Kabul: Aynı bilgiyi tekrar tekrar sormasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P013 — Uygulama ayarları ile asistan araçlarının kapsam haritasını tamamla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Desteklenmeyen işlem yapılmış gibi anlatılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P014 — “Ses yetişmiyor/çeviri kötü” şikâyetini kanıta dayalı teşhise dönüştür.

- Tür: Yeni uzantı/deneme.
- Kabul: Ölçüm olmadan rastgele ayar değiştirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P015 — Birbirine yakın komutları gerçek işlem niyetine göre ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Çeviri isteği yalnız özetle cevaplanmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P016 — Altyazı varsa kullan, yoksa Whisper akışını gerçek videolarla sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Aynı kaynak gereksiz yeniden işlenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P017 — Bağımsız okuma araçlarını güvenle birlikte çalıştırabil.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yazma işlemlerinin sırası korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P018 — Uzun istekleri sınırlı ve izlenebilir alt planlara böl.

- Tür: Mevcut temeli geliştirme.
- Kabul: Araç tur sınırında iş sessizce yarım kalmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P019 — Tekrarlanan model çağrısı ve çift tıklamada işlem tekilliğini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Aynı üretim iki kere başlamasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P020 — Sağlayıcı/modelin gerçek araç çağırma yeteneğini doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Destek yoksa yanlış başarı üretilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P021 — Ayar değişikliği kartında önceki ve sonraki değerleri göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yalnız değişecek alanlar listelensin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P022 — “Yalnız bu iş” ile kalıcı varsayılan değişikliğini ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Geçici tercih sonraki işleri etkilemesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P023 — Bir ayarın bağlı seçeneklere etkisini anlaşılır açıkla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kullanıcı gizli yan etkiyle karşılaşmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P024 — Kart hazırlanırken yapılan elle ayar değişikliğini koru.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yeni insan tercihi sessizce ezilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P025 — Geri alma başarısızlığını ve yeniden denemeyi gerçek kayıtla sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Ekran ve disk farklı kalmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P026 — Eskimiş işlem kartını güncel durumdan yeniden hazırlayabil.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eski hedefe körlemesine işlem uygulanmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P027 — Çok adımlı işin tamamlanan, çalışan ve kalan adımlarını göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Gerçek durum işlem zinciriyle uyuşsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P028 — İş bitince doğru sohbetin doğru aşamadan devamını kolaylaştır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Biten aşama yeniden çalıştırılmasın.
- Durum: Kısmen uygulandı. Yeniden yüklenen kaynakta devam doğru görünür yanıta bağlanır; genel çok aşamalı üretim sonrası devam kapsamı ayrıca tamamlanacak.

### P029 — Kısmi sonuçta eksik kalan aşama ve miktarı açık göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kaynak/çeviri/ses kapsamları karışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P030 — Birden fazla işte konuşma, kaynak ve çıktı bağını görünür kıl.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yanlış işin sonucu kullanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P031 — Durdurma isteği ile gerçekten durmuş işi ayır.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Reddedilen iptal “durduruldu” sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P032 — Gezinme ve sekme değişiminde geciken iş olaylarını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Sonuç yanlış videoya bağlanmasın.
- Durum: Kısmen uygulandı. Sohbetin geç olayları ve silme/temizleme korunuyor. Tüm üretim/sekme kombinasyonlarının kabulü bu pakette yapılmadı.

### P033 — Başarısız aşamayı tamamlanmış işleri koruyarak yeniden denet.

- Tür: Mevcut temeli geliştirme.
- Kabul: İyi çıktı gereksiz tekrar üretilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P034 — Uygulama yeniden açılınca eski iş kartının güncelliğini açıkla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Artık mevcut olmayan iş erişilebilir sanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P035 — İşin kabulü, sağlayıcı bekleme ve gerçek tamamlanmayı ayrı göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Sahte ilerleme yüzdesi kullanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P036 — Araç hatasını ilgili adımda uygulanabilir çözüme bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Genel hata yerine doğru düzeltme açılsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P037 — “Bunu durdur/devam et” komutunu doğru etkin işe bağla.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Belirsiz durumda başka iş etkilenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P038 — Uygulanmış plan değişince yalnız kalan adımları yeniden düzenle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Önceki başarılı işlem geri dönmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P039 — Manuel YouTube altyazısından Türkçe dublaja tam zinciri sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Kaynak, dil ve aralık korunsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P040 — Otomatik YouTube altyazısıyla kısa aralık denemesini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Otomatik kaynak niteliği kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P041 — Altyazısız videoda Whisper, çeviri ve ses hazırlığını birlikte sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Aşamalar gerçek tamamlanmayı beklesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P042 — Ses hazırlığındaki eksikleri tek uygulanabilir özetle çıkar.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eksik referans ve eksik çeviri ayrışsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P043 — “Bu sahneyi önce dene” isteğini doğru kısa örneğe dönüştür.

- Tür: Mevcut temeli geliştirme.
- Kabul: Bütün video yanlışlıkla üretilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P044 — Üretimden önce okunacak Türkçe varyantı açık belirt.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kaynak ve konuşma çevirisi karışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P045 — “Bu cümle kötü okunmuş” ifadesini gerçek ses grubuna bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: İlgisiz grup yeniden üretilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P046 — Bir metin düzeltmesinin etkileyeceği ses gruplarını göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Onaylı ilgisiz gruplar korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P047 — “Biraz daha doğal” isteğinde yalnız ilgili ayar/örneği karşılaştır.

- Tür: Yeni uzantı/deneme.
- Kabul: Bütün ses profili rastgele değiştirilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P048 — Üretim sonu inceleme önerisini gerçek kalite kanıtıyla hazırla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Otomatik kontrol doğallık garantisi olmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P049 — “Bu akşam ne izleyeyim?” için süre ve izleme durumunu birleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Önerilen yapım mevcut kısıtlara uysun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P050 — Birden fazla yapımı aynı ölçütlerle karşılaştırabil.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eksik bilgi uydurulmadan karşılaştırılsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P051 — Keşfet sonucunu kütüphaneye eklemeden yorum incelemesine bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Salt okuma için ekleme zorunlu olmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P052 — Aynı isimli filmlerde yıl/kimlik seçimini konuşmada netleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yanlış yapımın yorumları kullanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P053 — Koleksiyon oluşturma isteğini önizlemeli üyelik planına dönüştür.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eklenecek/çıkarılacak yapımlar görülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P054 — “Bunu neden önerdin?” sorusunu kişisel kanıta bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Puan veya açık tercih gösterilebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P055 — “Bu öneri bana uymadı” geri bildirimini yorumlanabilir tercihe çevir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Profil sessizce ve belirsiz değişmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P056 — İstenen kütüphane filtresini gerçekten ilgili ekranda açabil.

- Tür: Mevcut temeli geliştirme.
- Kabul: Sohbet sonucu ile görünüm aynı olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P057 — Her araç için özgün ve anlaşılır işlem adı göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Her şey “Uygulama kontrolü” olmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P058 — İşlem adımlarında doğrulanmış kısa sonuç özetleri göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Bulunan sayı ve uygulanan işlem doğru olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P059 — Bekleme göstergesini gerçek araç/iş evresine bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Uydurma düşünce veya aşama gösterilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P060 — Uzun yanıt, alıntı, kod ve kartların yerleşimini sağlamlaştır.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Mesajlar ve gönderme alanı çakışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P061 — Yeni mesajda kaydırma ve “son yanıta dön” davranışını iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Okunan eski mesajdan zorla koparmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P062 — Kaynak, araç adımları ve işlem kartlarını tek yanıtta ilişkilendir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Gerekçe ile işlem bağı izlenebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P063 — Dar pencere ve yüksek Windows ölçeğinde asistanı görsel doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Kontroller ekran dışında kalmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P064 — Klavye, odak ve ekran okuyucu akışını tamamla.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Aç/kapat/gönder/durdur odak kaybetmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P065 — Uzun sohbette kabul edilmiş kararları kısa ve kaynaklı özetle koru.

- Tür: Mevcut temeli geliştirme.
- Kabul: Bağlam daralırken kararlar kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P066 — Kaynak içindeki sahte talimatlara karşı gerçek araç akışını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Sayfa/altyazı metni işlem yetkisi sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P067 — Geç araç yanıtı, iptal ve sohbet değişimini birlikte sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Eski yanıt yeni konuşmayı değiştirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P068 — Kesilen akışta yarım araç argümanlarını işlem saymama davranışını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Eksik JSON eylem başlatmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P069 — DeepSeek ile Türkçe komut seçimi için zor bir değerlendirme seti kur.

- Tür: Yeni uzantı/deneme.
- Kabul: Beklenen araç/hedef/parametre ayrı ölçülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P070 — Asistanın başarısını gerçek son durumla karşılaştıran ölçüm ekle.

- Tür: Yeni uzantı/deneme.
- Kabul: “Yaptım” ile uygulanan durum uyuşsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Altyazıdan ses — P071–P110 (40)

Kod dayanağı: `tools/voxcpm2/altyazi_oku.py; dub_finish.py; dub_candidate.py; dub_delivery.py; src/dub-service.js; src/renderer/dub-generator-ui.js`.

### P071 — Temsilî gerçek video kesitleriyle Türkçe dublaj kalite setini genişlet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Belgesel, diyalog ve hızlı konuşma ayrı değerlendirilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P072 — A/B değerlendirmesini anlam, telaffuz, vurgu ve akışa ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tek bir ASR puanı kazanan seçmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P073 — Sıra sayıları için bağlama duyarlı Türkçe okunuş geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Sıra numarası sıradan sayıyla karışmasın.
- Durum: Kısmen uygulandı. Açık apostroflu sıra ekleri: 3’üncü → üçüncü. Belirsiz noktalı sıra ve tarih çıkarımı eklenmedi.

### P074 — Tarihlerin doğal okunuşunu sürüm ve kimliklerden ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Açık tarih doğru söylenebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P075 — Saat, süre ve skor okunuşlarını birbirinden ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: 14:30 bağlama uygun okunsun.
- Durum: Kısmen uygulandı. Yalnız açık saat etiketiyle 14:30 ve uyumlu ekler okunur; yalın saat/skor/tarih değiştirilmez.

### P076 — Sayı aralıklarını negatif sayı ve ürün kodlarından ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: 5–7 dakika yanlış işlenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P077 — Kesirlerin doğal okunuşunu tarih ve bölüm numarasından ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Miktar ve birim aynı kalsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P078 — Sayılara gelen Türkçe ekleri doğru okuttur.

- Tür: Mevcut temeli geliştirme.
- Kabul: 2026'da ve 5'e ek kaybetmesin.
- Durum: Kısmen uygulandı. Ölçü ekleri: 5 kg’dan → beş kilogramdan; doğal sayı/tarih eklerinin tümü henüz kapsanmıyor.

### P079 — Büyük miktarların güvenli Türkçe okunuş kapsamını genişlet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kimlik dizileri sayısal miktara dönüşmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P080 — Başında sıfır olan kodların okunuşunu koru.

- Tür: Mevcut temeli geliştirme.
- Kabul: 007 gibi diziler kısaltılmasın.
- Durum: Doğrulandı — mevcut davranış korundu. 007 ve 00123 gibi başında sıfır olan kimlikler yeni kurallarla kısalmıyor. Yeni özellik diye sayılmadı.

### P081 — Teknik sürüm ve protokol adlarının okunuşunu iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: v2.4 ile ondalık miktar karışmasın.
- Durum: Kısmi doğrulama. v1.2, saat olmayan 10:18 ve protokol benzeri km/hz bozulmuyor. Teknik adların yeni telaffuz sözlüğü henüz eklenmedi.

### P082 — Harf harf ve kelime gibi okunan kısaltmaları ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tanımlı kısaltma tutarlı söylensin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P083 — Gerçekte kullanılan teknik birimlerin okunuş kapsamını genişlet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Değer, büyüklük ve birim korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P084 — Özel ad sözlüğünü Türkçe ekli biçimlerde kullanabil.

- Tür: Mevcut temeli geliştirme.
- Kabul: Ad düzelsin, aldığı ek kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P085 — Telaffuz sözlüğünde Türkçe harf ve uzun ifade eşleşmesini geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: I/ı ve İ/i doğru işlensin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P086 — Çakışan telaffuz kurallarının etkisini önizle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Üretimle aynı dönüşüm görülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P087 — Karışık dilde özel ad düzeltmesinin kapsamını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Bütün cümlenin dili değişmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P088 — Türkçe ritim riskini hece/karakter bilgisiyle kalibre et.

- Tür: Mevcut temeli geliştirme.
- Kabul: Gereksiz tekrar dinleme kanıtıyla azalsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P089 — Uzun yan cümlelerde nefes ve yüklem bağını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Bölünmüş ses anlamı parçalamadan birleşsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P090 — Alıntı içi soru ve retorik soruda söyleyiş seçimini değerlendir.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Her soru işareti aynı tona zorlanmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P091 — Kaynak söyleyiş analizinin gürültülü/müzikli örneklerini genişlet.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Zayıf kanıttan duygu uydurulmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P092 — Konuşmacı ve sahne değişimindeki ton sürekliliğini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Farklı konuşmalar yanlış birleşmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P093 — Anlam odağı ve vurgu aktarımı için sınırları belli prototip değerlendir.

- Tür: Yeni uzantı/deneme.
- Kabul: Model desteği ve dinleme kazancı kanıtlansın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P094 — Düşük sesli son hece ve ünsüzlerin korunmasını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Sessizlik işlemi gerçek konuşmayı kesmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P095 — Korunan arka plandaki özgün konuşma sızıntısını değerlendir.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Türkçe sesle yarışan diyalog anlaşılabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P096 — Çapraz kaynak oynatıcıda dublajdan özgün sese dönüşü sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Özgün ses kalıcı sessiz kalmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P097 — Yavaşlatılmış bölgede atlama, duraklatma ve hız değişimini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Doğru ses konumuna dönülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P098 — Uzun videoda senkron haritasının birikimli kaymasını ölç.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Son bölümde de konuşma eşleşsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P099 — Yenilenen grup birleşimlerinde çıt ve hece çakışmasını denetle.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Giriş ve çıkış birlikte doğrulansın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P100 — Gruplar arasındaki ses düzeyini doğal dinamikleri koruyarak iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kasıtlı vurgu düzleştirilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P101 — Sorunlu grubun yakın bağlamını tek hareketle dinlet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eksik yeri zaman çizelgesinde aratmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P102 — Süre uyarlamasını gerçek Türkçe konuşma süresiyle kalibre et.

- Tür: Mevcut temeli geliştirme.
- Kabul: Anlam budanmadan uygun alternatif seçilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P103 — Eşdeğer konuşma ifadelerini gereksiz reddeden korumaları incele.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yanlış kabul oranı artırılmadan iyileşsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P104 — Tüm onarım yollarının toplam tekrar bütçesini ölç.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Bir grup süresiz denenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P105 — Editör geçici hatası sonrası önbellekli sesin yeniden denemesini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Geçerli ses korunurken düzenleme tekrar denenebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P106 — Çıktı yazımı/dengeleme hatasında kullanılabilir sesi doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yarım dosya hazır sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P107 — Her konuşma grubunun çıktı karşılığını son kez uzlaştır.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Atlanan grup tamamlandı sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P108 — Örnekten tam üretime referans ve okunuş tutarlılığını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Örnekteki seçim sessizce değişmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P109 — Kaynak veya referans değişince eski sonucu doğru etiketle.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yanlış videoya eski ses uygulanmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P110 — İnceleme klavyesini ve sade sonuç ekranını tamamla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Ana eylemler dar pencerede erişilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Ses için çeviri — P111–P135 (25)

Kod dayanağı: `backend/transcribe.py; backend/sentence_translation.py; backend/speech_relations.py; src/dub-editor-client.js`.

### P111 — Videonun geç başlayan konularına yerel bağlam seçimini geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Açılış konusu bütün videoya dayatılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P112 — İngilizce dışı kaynaklarda anlam korumasının kapsamını ölç.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Desteklenmeyen kontrol başarı diye sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P113 — Şüpheli transkripsiyonun çeviriye etkisini görünür kıl.

- Tür: Mevcut temeli geliştirme.
- Kabul: Belirsiz söz kesin bilgiye dönüşmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P114 — Özne, nesne, alıcı ve sahiplik için zor karşılaştırma seti oluştur.

- Tür: Yeni uzantı/deneme.
- Kabul: Rol değişiklikleri ayrı ölçülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P115 — Belirsiz zamirlerde güvenilir bağlam yoksa kesinleştirmeyi önle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Uydurulan kişi eklenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P116 — Olumsuzluk kapsamı ve çift olumsuzlukları karşılaştırmalı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yalnız “değil” varlığı yeterli sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P117 — Unless/until/without türü olumsuz koşulları kapsamlı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Koşulun yönü korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P118 — Rica, alışkanlık ve olasılık kiplerini ayırt etmeyi geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Could/would tek kategori sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P119 — Göreli zaman ve anlatı zamanını korumayı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Önce/sonra veya geçmiş/gelecek ters dönmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P120 — Nicelik kapsamını sesli metinde korumayı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yalnız, en az ve hariç ayrışsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P121 — Karşılaştırma yönü ve çarpanları zor örneklerle sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Özne ve değer tersine çevrilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P122 — Birim ve para dönüşümlerinin kaynak dışı eklenmesini önle.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Doğal söyleyiş olguyu değiştirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P123 — Terim karşılığı, ilk açılım ve sonraki kullanımı birlikte yönet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Aynı kavram partiler arasında değişmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P124 — Sen/siz kararını ilişki ve sahne düzeyinde düzeltilebilir kıl.

- Tür: Mevcut temeli geliştirme.
- Kabul: Bir kişinin tercihi herkese yayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P125 — Diyalogdaki kişi ve hitap üslubunun sürekliliğini değerlendir.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Anlatıcı dili karaktere dayatılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P126 — Deyim, mizah ve sözcük oyunu için kontrollü değerlendirme yap.

- Tür: Yeni uzantı/deneme.
- Kabul: Akıcı çeviri şakanın işlevini ters çevirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P127 — Felsefi/teknik ayrımları doğal Türkçede koruyan testler kur.

- Tür: Yeni uzantı/deneme.
- Kabul: Yakın terimler aynı kavrama eritilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P128 — Konuşma dilini gereksiz resmî isim-fiil zincirlerinden arındır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Belgesel ve gündelik üslup karışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P129 — Anlamlı tekrar, tereddüt ve vurgu noktalamasını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Akıcılık adına konuşmanın işlevi silinmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P130 — Seçili aralığın yarım cümle sınırlarına bağlam sağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Aralık dışındaki metin değiştirilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P131 — Ekran altyazısı ile konuşma metnini izlenebilir eşleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Hangi varyantın okunduğu açık kalsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P132 — Kaynak, ilk çeviri ve son konuşma metnindeki farkı göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yalnız değişen anlamlı bölüm vurgulansın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P133 — Doğru eşdeğerleri reddeden kalite kapılarını hata türüne göre kalibre et.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yeni anlam kaybı kabul edilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P134 — Tek düzeltmede yalnız etkilenen çeviri gruplarını yeniden işle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Onaylı komşular ve istekler korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P135 — Bir hatayı onaran adayın başka anlam hatası eklemesini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: İlk geçerli metin kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Normal altyazı ve Whisper — P136–P160 (25)

Kod dayanağı: `backend/transcribe.py; src/browser-subtitles.js; src/browser-subtitle-review.js; src/subtitle-sentence-layout.js; src/subtitle-output-contract.js`.

### P136 — Mevcut manuel/otomatik altyazı ile Whisper seçimini kaliteye göre değerlendir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kaynak türü tek başına kalite sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P137 — Video içindeki dil değişimlerinin etkisini ölç.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Kısa yabancı bölüm yanlış temizlenmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P138 — Seçili kesitte ilk sözcük ve özgün zaman ofsetini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Başlangıç konuşması kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P139 — Medya sonundaki son sözcük ve cue süresini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Son replik erken bitmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P140 — VAD ve filtrelerde kısa gerçek yanıtları korumayı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Evet/yok/dur yanlış silinmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P141 — Fısıltı ve gürültülü konuşmada güven işaretlemesini geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Düşük güven otomatik silmeye dönüşmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P142 — Üst üste konuşmada mevcut ayrıştırma sınırlarını açık göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tek konuşmacı sonucu eksiksiz sanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P143 — Mikro cue birleştirmesinde konuşmacı sınırını doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Başka kişinin sözüne metin taşınmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P144 — Mikro cue birleşiminde biçim ve SDH sahipliğini koru.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Etiket yanlış repliğe geçmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P145 — Aynı başlangıçlı meşru cue'ların korunmasını sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Normalizasyon metin kaybettirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P146 — Sessizliğe hizalamada yanlış komşu konuşmaya atlamayı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Zayıf kanıtta eski zaman korunsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P147 — Türkçe tamlama ve özel adlarda satır kırmayı geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Birlikte okunacak sözler gereksiz ayrılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P148 — Soru parçacığı, bağlaç ve yüklemin cue sınırını iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Anlamsız yarım replik oluşmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P149 — CPS hesabını gerçekten görünen metin üzerinden doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Biçim etiketleri hızı şişirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P150 — Kalite raporunu sorunlu cue'ya doğrudan gezinmeye bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kullanıcı tüm dosyayı taramasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P151 — Düşük güven bilgisinin bölme/birleştirme sonrası sahipliğini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Başka cümle yanlış vurgulanmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P152 — Gerçek tekrar ve kekelemeyi halüsinasyondan ayırmayı sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Vurgu amaçlı tekrar kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P153 — Noktalama onarımının komşu iyi metni değiştirmemesini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Kelime-zaman ilişkisi korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P154 — Karışık dilde ad ve kısa alıntıların temizlenmesini denetle.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Yabancı ad script kirliliği sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P155 — Devam sınırında eksik ve çift sözcükleri birlikte sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Checkpoint birleşimi eksiksiz ve tekrarsız olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P156 — Değişmiş girdide eski devam noktasının reddini sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Aynı dosya adı yanlış eşleştirmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P157 — Ana sayfaya geçiş ve dönüşte altyazı işini uçtan uca sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: İş ve canlı sonuç kaldığı yerden sürsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P158 — Türkçe kodlama onarımını okuma, düzenleme ve kayıtta doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Mojibake geri yazılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P159 — SRT/VTT/ASS dönüşümlerinde metin ve biçim bütünlüğünü sına.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Desteklenen etiket ve diyaloglar korunsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P160 — Altyazı görünümünü video, ölçek ve ekran kenarlarında doğrula.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Metin kontrolleri ezmesin ve kesilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Medya kütüphanesi — P161–P175 (15)

Kod dayanağı: `src/renderer/media-catalog.js; src/media-catalog-store.js; src/media-catalog-service.js; src/catalog-metadata-sync.js`.

### P161 — Tür, yönetmen, süre, puan ve izleme durumunu birlikte filtrele.

- Tür: Mevcut temeli geliştirme.
- Kabul: Etkin filtreler ayrı kaldırılabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P162 — Filtreli kütüphane görünümlerini kaydedilebilir kıl.

- Tür: Yeni uzantı/deneme.
- Kabul: Açıldığında güncel sonuçlar hesaplansın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P163 — Sıralamada eksik bilgi ve sıfır puanı tutarlı işle.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Gerçek 0 boş bilgi sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P164 — Mevcut koleksiyonları kurallı üyelik önizlemesiyle geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Listeden çıkarma yapımı silmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P165 — Toplu durum düzenlemesini önizleme ve geri almayla güçlendir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Etkilenen kayıt sayısı açık olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P166 — Ayrıntıdan dönüşte filtre, kaydırma ve odağı koru.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Kullanıcı aynı karta dönebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P167 — Yönetmen/oyuncu bağlantılarından yerel yapımlara gezinmeyi geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eşleşmenin kapsamı anlaşılır olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P168 — Tam/özgün başlık ve özet aramasının sıralamasını iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tam başlık tesadüfi özet eşleşmesini geçsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P169 — Sonuç yokken kontrollü yazım önerileri sun.

- Tür: Yeni uzantı/deneme.
- Kabul: Sorgu kendiliğinden değiştirilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P170 — Aynı yapımın dosya sürümlerini ortak detayda yönet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kaynak, süre ve ilerleme ayrı kalsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P171 — Dizide sıradaki bölüm ve sezon ilerlemesini tutarlı göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Görünen bölüm gerçekten oynatılsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P172 — Yanlış metadata eşleşmesini kanıtlı önizlemeyle düzelt.

- Tür: Mevcut temeli geliştirme.
- Kabul: Doğru dosya/ilerleme bağlantısı korunsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P173 — Eksik afiş ve thumbnail onarımını görünür ve ölçülü yap.

- Tür: Mevcut temeli geliştirme.
- Kabul: Bozuk görsel boş kart gibi kalmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P174 — Kaybolan yerel dosyayı kimliğini koruyarak yeniden bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: İzleme geçmişi ve altyazı bağı kaybolmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P175 — Büyük kütüphanede kaydırma ve kart çizimini ölçerek iyileştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tasarım, odak ve konum korunabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Letterboxd ve yorum analizi — P176–P190 (15)

Kod dayanağı: `src/letterboxd-reviews.js; src/letterboxd-auto.js; src/renderer/review-decision-ui.js; src/renderer/media-tools-ui.js`.

### P176 — Her yorumun güvenli özgün bağlantısını analizde koru.

- Tür: Mevcut temeli geliştirme.
- Kabul: Alıntıdan doğru yoruma gidilsin.
- Durum: Uygulandı — parser, kayıt ve native ekran. Her yorumun güvenli özgün bağlantısı kayda ve kanıt kartına taşınır; komşu yorum ve gövde içi sahte link sahiplenilmez.

### P177 — Yorum kartının tarih ve puanını komşusundan ayırarak al.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eksik alan tahmin edilmesin.
- Durum: Uygulandı — parser, kayıt ve native ekran. Tarih ve 0.5–5 yıldız puanı kendi yorum kartından alınır; bulunmayan alanlar tahmin edilmez.

### P178 — Popüler/yeni/yüksek/düşük puan sıralamalarını örnek kaynağına bağla.

- Tür: Mevcut temeli geliştirme.
- Kabul: Analizin hangi havuzu kullandığı görülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P179 — Olumlu, olumsuz ve yeni yorumlardan dengeli örnekleme geliştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Gerçek kapsama sayıları açık olsun.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P180 — Yorum örneğini görsel dahil et/çıkar kartlarıyla düzenle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Yalnız seçili yorumlar modele gitsin.
- Durum: Uygulandı — native seçim → gönder → kayıt. Yorumları tek tek dahil et/çıkar; bütçe her seçimde hesaplanır; yalnız gerçek seçilen metin gönderilip kaydedilir, spoiler açık izinsiz görünmez.

### P181 — Uzun yorumun bütün bütçeyi tüketmesini önle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kısaltılan ve dışlanan kaynak sayısı doğru kalsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P182 — Yorum dili filtresi ve yanlış dil düzeltmesini ekle.

- Tür: Yeni uzantı/deneme.
- Kabul: Bilinmeyen dil ayrıca gösterilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P183 — Alıntının isteğe bağlı Türkçe karşılığını özgünle birlikte göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Çeviri özgün alıntı sanılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P184 — Yorum sayısıyla bağımsız yazar sayısını ayır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Tek yazar çok görüş gibi görünmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P185 — Yakın kopya yorumları inceleme adayı olarak işaretle.

- Tür: Mevcut temeli geliştirme.
- Kabul: Benzer metin bağımsız kanıt sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P186 — Spoiler, tekrar ve bütçe nedeniyle dışlananları ayrı say.

- Tür: Mevcut temeli geliştirme.
- Kabul: Getirilen/uygun/gönderilen sayıları uzlaşsın.
- Durum: Uygulandı — bilinen yüklü örneğin sayıları. Kaynak okuma ve analiz seçimi ayrı neden/sayılarla gösterilir; görülmeyen yorum sayısı tahmin edilmez, sınırlı örnek açıkça belirtilir.

### P187 — Eski ve yeni yorum örneklerini kaynak farklarıyla karşılaştır.

- Tür: Mevcut temeli geliştirme.
- Kabul: Analiz öncesi değişiklik anlaşılabilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P188 — Profil veya örnek değişince analiz güncelliğini belirt.

- Tür: Mevcut temeli geliştirme.
- Kabul: Eski analiz yeniymiş gibi sunulmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P189 — Tempo, hikâye ve oyunculuk görüşlerini kişisel tercihle kanıtlı eşleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kanıt olmayan alanda yeterli yorum yok densin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P190 — Yorum getirmede kesinti ve erişim engelini açık yönet.

- Tür: Önce doğrula; eksikse düzelt.
- Kabul: Önbellek ve kısmi sonuç tam sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Zevk profili — P191–P200 (10)

Kod dayanağı: `src/media-taste.js; src/taste-quiz.js; src/renderer/media-taste-ui.js; src/media-discovery-service.js`.

### P191 — Profil kanıtını IMDb/TMDB kimlikleriyle daha sağlam birleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Farklı dilde aynı yapım tanınsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P192 — Yeniden izlemelerin profil ağırlığını görünür ve denetlenebilir yap.

- Tür: Mevcut temeli geliştirme.
- Kabul: İzleme sayısı benzersiz eserle karışmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P193 — Son dönem zevkiyle bütün geçmişi karşılaştır.

- Tür: Yeni uzantı/deneme.
- Kabul: İki dönemin örnek sayıları ayrılsın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P194 — Tür tercihini kişinin genel puanlama eğilimine göre değerlendir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Göreli beğeni açık gerekçelendirilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P195 — Tür adlarını dil yerine ortak kimlikle birleştir.

- Tür: Mevcut temeli geliştirme.
- Kabul: Drama ve Dram ayrı kanıt sayılmasın.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P196 — Eşleşmeyen veya eksik profil kanıtını düzeltilebilir kuyruğa al.

- Tür: Mevcut temeli geliştirme.
- Kabul: Düzelen kayıt kapsamı güncellesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P197 — Kişisel yorum analizinin örneğini çeşitlilikle seç.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kullanıcı seçilen kanıtları görebilsin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P198 — Analizdeki tercih çıkarımlarını tek tek kabul/ret yönet.

- Tür: Mevcut temeli geliştirme.
- Kabul: Reddedilen çıkarım öneriye girmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P199 — Açık tercih, quiz ve geçmiş arasındaki çelişkiyi açık göster.

- Tür: Mevcut temeli geliştirme.
- Kabul: Kullanıcının açık tercihi ezilmesin.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

### P200 — Tercih değişikliğinin önerilere etkisini kaydetmeden önizle.

- Tür: Yeni uzantı/deneme.
- Kabul: Değişen aday ve gerekçe görülsün.
- Durum: Bekliyor — kullanıcı uygulamayı onayladı.

## Teslim düzeni

14 çalışma paketi: P001–012, P013–026, P027–038, P039–048, P049–056, P057–064, P065–070, P071–090, P091–110, P111–135, P136–160, P161–175, P176–190, P191–200.

Paketler kesin gece bitiş taahhüdü değildir. Bağlantılı kabul koşulları birlikte doğrulanır; asistan arayüzü ile alttaki kütüphane/ses işlevleri aynı işi iki kez saymak yerine ayrı üretici-tüketici teslimleri olarak izlenir. Aynı dosyada paralel ajan değişikliği yapılmaz.

Yeni repo/kütüphane gerektiğinde güncel kaynak, lisans, gerçek uyumluluk ve mevcut koda göre getirisi araştırılır. Kaynaklardan yararlanmak çalışan gelişmiş hattı geriye götürmek için gerekçe değildir.
