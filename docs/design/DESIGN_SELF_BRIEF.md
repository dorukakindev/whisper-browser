# Whisper Browser · tasarım öncesi kendime görev

Kullanıcı kararı: 2026-11-13. Bu, Codex'in yetkilendirilmiş arayüz işlerinde kullanacağı çalışma brief'idir; skill değildir. Sabit bir palet, font, kolon veya düğme şablonu tanımlamaz. Yeni bir ekran yeniden tasarımı ya da Git teslimi kendiliğinden başlatılmaz.

## Koyu tema ve onay akışı · 2026-11-13

Kullanıcı sürekli koyu tema kullanır. Kullanıcı istemedikçe açık/beyaz tema tasarımına, görüntülerine veya ek görsel test turuna zaman ayırma; mevcut tema özelliğini kaldırma ya da kişisel ayarı değiştirme.

Kapsamlı görsel değişiklikte önce gerçek mevcut ekranı ve bağımsız öneri taslağını aynı içerik/ölçekte göster; onaydan sonra ürüne uygula. Kullanıcı doğrudan uygulama yetkisi vermişse veya aynı tasarımı zaten onaylamışsa rutin kararlar için yeniden onay döngüsü yaratma. İlgili efekt/hareket ve kullanım iyileştirmelerini kapsam içinde tamamla.

Doğrulama koyu temada bir masaüstü kompozisyonu ve gerekli tek dar alan kontrolüne odaklanır. Hata ya da yeni değişiklik olmadıkça aynı tam akışı tekrar tekrar açma; etkilenen adımı kontrol et. Testlerin kısa olması tasarımın yüzeysel olması anlamına gelmez.

## Uygulanacak prompt

Whisper Browser'ın ilgili ekranını güçlü, modern, sinematik ve özenle tasarlanmış bir medya deneyimi olarak çöz. İşlevleri taşıyan kutular ve düğmeler dizmekle yetinme. Kullanıcının istediği görsel kaliteyi kapsam içinde tamamla; basit bir çözümün yeterli olduğunu, çalışan bir düğmenin iyi tasarım sayıldığını varsayma.

Önce mevcut ekranı bütün olarak incele. Kullanıcı burada neye bakacak, neyi anlayacak ve hangi eylemi yapacak? Baskın içerik, ana eylem, destekleyici bilgi, gezinme ve ileri araçlar arasında açık bir hiyerarşi kur. Bunları kendi başına çalışan parçalar olarak değil, tek bir kompozisyon olarak tasarla.

Claude referanslarındaki ölçek, hizalama, içerik kimliği, tipografik ritim ve anlamlı gruplamadan öğren. Örnek ekranın renklerini, büyük başlığını, gradyanını veya kapsül düğmelerini otomatik kopyalama. Referansın nerede işe yaradığını ve hangi kusurunun aktarılmaması gerektiğini kısa biçimde belirle. İlgili örnekler ve gözlemler [inceleme notunda](2026-11-13-claude-design-lessons.md).

Uygulamadan önce ekranın görsel kararlarını somutlaştır: odak, medya ölçeği, bilgi sırası, ana hizalar, tipografi, yüzey/renk ilişkisi ve menülerin açılış davranışı. Gerekliyse kısa yerleşim denemesi yap; rutin estetik kararlar için kullanıcıyı onay döngüsüne sokma. Tasarım kararlarını birkaç gerekçeli cümleyle çöz; uzun genel tasarım raporu üretme.

Renkleri ve ışığı içerikle ilişkilendir. Birden fazla vurgu, güçlü atmosfer, dokular, cam, gradyan, parıltı veya hareket işe yarıyorsa kullan; etkileri ekranın amacı ve okunabilirliğiyle birlikte değerlendir. Her kontrolü doldurulmuş sarı düğme yapma. Eylemin önemi; konum, boyut, tipografi, yüzey, ikon ve etkileşimle de anlaşılabilir. Aynı işlevlerin tutarlı bir dili olsun; farklı işlevleri tek görsel kalıba zorla sokma.

Sinematik görünümü dev bir hero, aşırı boşluk veya koyu arka planla eşitleme. Başlık ve görsel, kullanıcının asıl işini ilk ekrandan kovuyorsa oranları yeniden çöz. Medya, metin ve kontrolleri pencere/kapsayıcı ölçüsünde birlikte değerlendir. Gerektiğinde kompozisyonu ve bileşen yapısını değiştir; yalnız renk, gölge ve border-radius değiştirmekle bitirme.

Menüleri kullanım senaryosuna göre tasarla. Sık kullanılan altyazı, çeviri, dublaj, ses ve asistan eylemleri kolay bulunmalı. İleri araçlar anlamlı adlarla erişilebilir kalmalı; yüzlerce eşit küçük ikon veya iç içe belirsiz panel üretme. Etkin kaynak, seçili seçenek ve çalışan iş anlaşılmalı. Açılan yüzeyler birbirini ve kritik oynatma kontrollerini örtmemeli. Aynı ayar için paralel işlem yolları kurma.

Gerçek içerik koşullarını ele al: uzun Türkçe başlıklar, kapaksız kayıt, çok sezonlu dizi, çok kaynaklı liste, boş/yükleniyor/hata durumu, aktif işlem/iptal ve daralan alan. Eksik bilgiyi süslü sahte veriyle örtme. Özellikleri azaltarak veya hataları gizleyerek yer kazanma.

Mevcut asistan/Whisper/çeviri/dublaj, kaynak-zaman-iş sahipliği, kullanıcı verisi ve güvenlik korunacak. Sabit altyazı şeridi konuşma aralarında yer değiştirmeyecek. Görünür odak, klavye, okunabilir kontrast, koyu tema ve azaltılmış hareket tercihi tasarımın parçası olacak. Bu güvenceleri mevcut rengi veya düzeni koruma bahanesi yapma.

Uygulamadan sonra gerçek render'a önce bütün olarak bak, sonra ayrıntıları düzelt. Medya ölçeği, menü hiyerarşisi, okuma sırası, kontrol erişimi ve oranlar hâlâ zayıfsa yalnız testlerin geçmesiyle teslim etme. İlgili bir masaüstü görünüm ve gerekli kısa dar alan kontrolü kullan; çok sayıda ekran görüntüsü yerine görülen somut kusuru çöz. Görmediğin native/cihaz/canlı sonucu başarılı sayma.

Skill veya agent kullanma. Mevcut kişisel farkları ve açık uygulamayı koru; Computer Use ve GitHub Actions kullanma. Uygulama kapsamını tamamla; yeni commit/push/merge için ayrıca açık talimat bekle.

## Teslimden önce kendime soracağım somut sorular

- Ekran ilk bakışta hangi içeriği ve hangi işlemi öne çıkarıyor; bunu gösterebiliyor muyum?
- Referanstan aldığım kararın bu ekranda bir işlevi var mı; yalnız görünüşünü mü tekrarladım?
- Ana içerik, başlık, menü ve kontrol grupları birbirinin alanını gereksiz tüketiyor mu?
- İkincil eylemler ana eylemle yarışıyor mu; ileri araçları gizleyip bulmayı zorlaştırdım mı?
- Uzun içerik, hata veya kaynak değişimi geldiğinde kompozisyon ve sahiplik korunuyor mu?
- Çalışan hâlin görüntüsünde hâlâ gördüğüm bir bozukluğu “test geçti” diyerek bıraktım mı?

Bu sorular sabit estetik veya puan eşiği değildir. Amaç kendi kararını somut ekran üzerinden değerlendirmek ve görülen kusuru gidermektir.
