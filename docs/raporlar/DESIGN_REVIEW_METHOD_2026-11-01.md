# Tasarım eleştirisi, beceri doğrulaması ve sonraki tur yöntemi

1 Kasım 2026. Ürün anlık görüntüsü `39e37c30aa3326a9299b28c2954dc72d0cdd818c`; ürün kodu değişmedi. Kullanıcının **yalnız raporlama, düzeltmeler sonra** talimatı geçerlidir. Bu metin önerilen çalışma yöntemidir; tasarım onayı veya uygulanmış UI değişikliği değildir.

## Eleştirinin doğru noktası

Beceri kullanıldığını söylemek, taşma testini geçirmek veya görüntü almak tek başına estetik kabul değildir. Önceki turlarda yerel iyileştirmeler, bütün ekranlardaki hiyerarşiyi yeterince sabitlemedi. Sorun yalnız yeni bir skill eksikliği olarak açıklanamaz. Afiş/adres/onay/okuma alanı bulguları [R824](BROWSER_BUG_REPORT_824.md) ile zaten görüntülü doğrulandı; aynı sorunlar ikinci kez yeni bug sayılmaz.

Diğer AI'nın görsel değerlendirmesindeki her iddia güncel kodda doğrulanmış değildir. Kapanış düğmesinin taşması, sohbet balonunun toggle örtmesi, poster başlığı üstüne eylem gelmesi ve hero yazı çakışması aynı viewport/zoom/içerikle yeniden yakalanmalıdır. Önceki veya farklı ölçekli ekran görüntüsü güncel bütün yüzeylerin kanıtı sayılamaz.

## Skill ve araç doğrulaması

- Resmî `openai/skills` curated kataloğu `skill-installer/scripts/list-skills.py --format json` ile sorgulandı. `playwright-interactive` var; kurulu değildi, kullanıcı skill-installer çağrısı kapsamında `C:/Users/K/.codex/skills/playwright-interactive` içine resmî yardımcıyla kuruldu. Yeni mesajda beceri keşfine dahil olabilir; kurulum yürütme başarısı değildir.
- OpenAI'ın [frontend yazısı](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4) `frontend-skill` adını ve kurulum komutunu içeriyor. Fakat güncel katalogda bu ad yok; yazının GitHub bağlantısı `skills/.curated/frontend-skill` için 404 döndü. “Kuruldu” denmedi; mevcut `frontend-design` ile aynı beceri kabul edilmedi.
- `playwright-interactive/SKILL.md` mevcut sürümü `js_repl` ve sandbox kapatma önkoşulu yazıyor. Bu oturumun etkin araçları bu adla bir runtime sunmuyor; yerel config'te de `features.js_repl` ayarı yok. Araç kurulumu bu önkoşulu çözmüş sayılmaz. **Config veya sandbox güvenlik ayarı değiştirilmedi.** Çalışan izole native Electron yakalama yolu korunur; yeni beceri uğruna güvenlik sınırları aşılmaz.
- [Resmî görsel doğrulama rehberi](https://learn.chatgpt.com/use-cases/frontend-designs) referanslarla karşılaştırma, mevcut tasarım sistemini kullanma ve farklı ekranlarda yinelemeyi önerir. Önceki rapordaki Electron capture yöntemi gerçek renderer görüntüsü üretmiştir; eksik olanı “hiç görüntü alınmadı” diye anlatmak da doğru değildir. Eksik, görsel hedefle kıyaslanan sıkı kabul disiplinidir.

## Önerilen kısa görsel sözleşme

1. **Sakin medya aracı:** mevcut grafit/amber dünya korunur. Pazarlama sitesi kompozisyonu ve her yüzeye ayrı görsel fikir uygulanmaz. Tasarım becerisi göreve göre seçilir; birden çok becerinin çelişen varsayılanları üst üste dayatılmaz.
2. **Tek baskın eylem:** aktif görev alanında tek dolu amber ana eylem; ikinciller hayalet, üçüncüller metin. Seçili durum ve semantik uyarı renkleri ana eylemle aynı sınıf değildir. “Bütün pencerede yalnız bir amber piksel/öğe” gibi katı kural konmaz.
3. **Sabit hiyerarşi:** aynı gezinme seviyesinde seçili durum tek yöntemle gösterilir. Klavye odağı seçili sekmeden ayrıdır ve kaldırılmaz. Buton türleri dolgu/hayalet/metin olarak tutarlı olur; bütün kontroller çerçeveli hap yapılmaz.
4. **Boşluk ritmi:** önerilen ölçek 4/8/12/16/24/32 px; normal panel içi 16 px başlangıç hedefi. Yoğun toolbar ve okuma sayfası için gerekçeli varyantlar olabilir. Aralığı düzeltmek için okunabilir fontu/hedef alanı küçültme.
5. **İçerik önceliği:** büyük boş durumlar ve yinelenen başlıklar içerikle yarışmaz. Günlük eylemler açık, ileri ayarlar estetik ve erişilebilir disclosure altında kalır. Ayarları silmek sadeleştirme değildir.
6. **Erişilebilir sadeleşme:** native select yalnız eski görünüyor diye custom widget'a çevrilmez; klavye, arama, çok seçenek ve ekran okuyucu korunmalıdır. Chevron görseli değişirse details/summary semantiği kalır. Hover'a taşınan afiş eylemi focus/touch ile de erişilebilir olur. Kaydırma çubuğu gizlenirse yatay içeriğin varlığı ve klavye erişimi kaybolmaz.
7. **Hareket:** kullanıcının eylemini açıklayan az ve tutarlı geçiş; aynı olaya farklı easing/süre yığma. Reduced-motion, yükleme/iptal ve kaynak değişimi davranışları korunur. Statik PNG hareket kalitesinin kanıtı değildir.
8. **Ölçü ve referans:** CSS viewport, native içerik boyutu, DPR/zoom, dil/tema ve veri durumu kayıtlıdır. Sentetik afiş fotoğraf kalitesinin; parent yakalama native video yüzeyinin kanıtı değildir. Yeni önerilen eşikler mevcut ürün sözleşmesi diye sunulmaz.

## Bir yüzey için kabul döngüsü

1. Önce tek yüzey seç; başlık/eylemler/boşluk/renk/scroll/motion hedefini kısa yaz. Güncel görüntüyü başlangıç kanıtı, seçilen referansı ayrı hedef olarak etiketle.
2. Bir güçlü parça referansı ve bir karşılaştırma yeterlidir. Luna ilham kaynağı olabilir; güncel kodu/görseli görülmeden “Luna'dan alındı” denmez. Plex/Linear gibi başka ürünlerin tamamını aynı ekrana birleştirme. Henüz kullanıcı tarafından onaylanmış tek bir nihai örnek ekran yoktur.
3. Günlük görünüm ile ayrıntılı görünümün tasarımını birlikte öner; başta tüm ekranları değiştirme. Kullanıcı düzeltme istediğinde uygulamaya geç.
4. Ajanlardan biri o yüzeyin tasarımını, diğeri bağımsız karşılaştırma/etkileşim kontrolünü yapabilir. Ortak CSS'e paralel çelişen patch yazılmaz; tek tasarım kararı sahibi olur.
5. Fonksiyon testinden ayrı görsel kabul yap: referansla yan yana başlık ölçeği, amber ağırlığı, hizalama, satır uzunluğu, görünür içerik, sticky katmanlar, boş/yükleniyor/hata/sonuç ve açık/koyu/dar durumları kıyasla. Gerçek uzun metin ve Türkçe etiketlerle bak.
6. “Test geçti” ile “görsel hedefi tuttu” ayrı sonuç olsun. Farklar devam ediyorsa açık yaz; “güzel oldu” diye teslim etme. Onaylanan en iyi yüzey daha sonra iç referans yapılabilir.

Sonraki önerilen tek yüzey film ayrıntısıdır: F1 responsive sahipliği, F2 masthead bütçesi, F3/F4 yorum iş akışı aynı görsel hedefte değerlendirilebilir. **Bu öneri bu tur uygulanmadı.**
