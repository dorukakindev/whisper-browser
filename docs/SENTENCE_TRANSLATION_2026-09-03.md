# Cümle bütünlüğüyle altyazı çevirisi

## Uygulanan kapsam

Tarayıcı çevirisi ve Python dosya çevirisi, kaynak blokları değiştirmeyen bir cümle haritası kullanır. Bu, ayrı bir model çalıştıran anlamsal bölümleyici değil; sınırları tutucu biçimde belirleyen yerel bir gruplamadır.

- En fazla 6 blok, 280 kaynak karakteri, 12 saniye; komşu bloklar arasında en fazla 1,2 saniye boşluk. 50 ms üzerindeki örtüşmede grup ayrılır.
- Cümle sonu, görünür konuşmacı/SDH/müzik işaretleri ve geçersiz süreler sınırdır. Bilinen kısa unvanlar (`Dr.` gibi) cümle sonu sayılmaz. Tarayıcıda varsa konuşmacı kimliği değişimi de ayrılır.
- Çok bloklu grupta modelden hem tam çeviri hem sıralı yerleşim istenir. Kaynak parçalarını bağımsız çevirme zorunluluğu kalkar; **başka gruba anlam taşıma yasağı kalır**.
- Parça sayısı, doluluk ve parçaların tam çeviriyi kayıpsız oluşturması doğrulanır. Boşluk ve Unicode NFC farkları dışında değişiklik kabul edilmez. Bu kontrol **kaynakla anlamsal eşdeğerlik kanıtı değildir**.
- Kaynak blokların zamanları ve kimlikleri model tarafından yazılmaz. Geçerli yanıtlar aynı zaman aralıklarına uygulanır; kaynak metin değiştirilmez.
- Python istek paketleri cümleyi 20 blok sınırında bölmez. Cümle grubu önbelleğe tek kayıt olarak girer. Eksik veya bozuk kayıt bütün grubun yeniden istenmesine neden olur.
- Mevcut isteğe bağlı ikinci geçiş, parçaları tek başına değil tam kaynak ve çeviri cümlesiyle değerlendirir. Eksik/tutarsız yanıt grubun hiçbir parçasını değiştirmez; böyle bir sonuç onaylı çeviri olarak önbelleğe yazılmaz. İlk geçişte başarısız gruplar ikinci geçişe gönderilmez.
- Yeni önbellek anahtarları eski protokolden ayrıdır; model, üslup, sözlük ve mevcut bağlama ek olarak grubun parça/süre yapısı da dikkate alınır. Eski dosyalar silinmez, eski anahtarlar yeniden kullanılmaz.

Tarayıcıda tek bloklu istekler düz metin uyumluluğunu korur. Çok bloklu **üretim** akışında parça haritası zorunludur. Genel zamanlayıcıyı düz metinle çağıran eski kullanım için süre ağırlıklı yerleştirme korunmuştur; burada kelime sayısı kaynak blok sayısından azsa mevcut birleştirme davranışı devam eder. Bu uyumluluk yolu yeni çok bloklu üretim isteğinin doğrulamasını atlayamaz.

## Hata ve maliyet davranışı

Python'da eksik/tutarsız cümle grubunun tamamında kaynak metin kalır ve başarısız blok sayısı raporlanır; hiçbir grup çevrilemezse çeviri dosyası üretilmez. Tarayıcıda hatalı grubun hiçbir parçası yayımlanmaz; mevcut sınırlı tekrar deneme mekanizması işletilir.

Model, API anahtarı, sağlayıcı/yedek rota, paralellik ve ikinci geçiş seçimi değiştirilmedi. Ayrı mapper/critic modeli veya zorunlu ek API aşaması eklenmedi. Tam çeviri ve parçaları birlikte döndürmek yanıtı uzatabilir; token maliyetinin azalacağı iddia edilmez.

## Doğrulama

- `npm test`: 38 Node test dosyası ve 118 Python testi geçti.
- Her iki dilde aynı 10 sınır vakası kullanılıyor: Türkçe söz dizimi örneği, kısaltma, konuşmacı, ikinci satırdaki konuşmacı işareti, SDH, uzun boşluk, örtüşme, süre, parça sayısı ve sıfır süre.
- Yeni testler: eksik/boş/yeniden sıralanmış parça, fazladan sözcük, parçalarla tam cümle uyuşmazlığı, bütün-grup cache, bozuk cache, süre/bağlam değişimi, eksik refine, refine onayıyla cache, 20 blok sınırında bölünmeme, kaynak zamanlarının korunması.
- Tarayıcının gerçek main istek fonksiyonu sahte taşıma katmanıyla çalıştırıldı; model seçimi, yapılandırılmış gövde, tek blok uyumluluğu ve çok bloklu düz yanıtın reddi denetlendi.
- Gerçek sağlayıcı çağrısı, Electron oturumu, model indirmesi veya GPU işlemi yapılmadı. İyi Türkçe örnekler test verisidir; canlı modelin aynı kalitede yanıt verdiğine ilişkin ölçüm değildir.

## Bilinen sınırlar

Etiketsiz konuşmacı değişimi, ironi, sahne kesmesi ve sonradan açıklanan bilgi yalnız bu kurallarla kesin saptanamaz. Gerçek içerikte izleyerek değerlendirme gerekir. Çok kısa bir Türkçe karşılığın çok sayıda kaynak bloğa boşluksuz/tekrarsız dağıtılması mümkün değilse grup reddedilebilir; uydurma dolgu veya tekrar eklenmez. Daha akıllı bir anlamsal mapper, gerçek örneklerde bu sınırın ölçülmesinden sonra ayrı bir çalışma olarak ele alınmalıdır.
