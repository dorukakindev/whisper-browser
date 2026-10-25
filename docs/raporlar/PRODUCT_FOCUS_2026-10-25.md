# Yeni ürün hedefi — kitap, okuyucu ve dublaj

Kullanıcı25 Ekim2026'da yeni çalışma hedefi belirlememi istedi. Bu plan yeni aktif hedef olarak kaydedildi; önceki listenin bitmiş olduğu iddia edilmez. Başlangıç dalı `codex/book-reliability549`, HEAD `abc05762fe9278a4a0dcafee974dfc3a5cd317dc`, teslim PR487. Yedek/kurtarma bakımını genişletme talebi yok; kullanıcı bu alanı erteledi. Yeni hedef doğrudan kullanıma odaklanır.

| ID | Durum | Kullanıcıya sağlanacak sonuç | Tamamlanma kanıtı |
|---|---|---|---|
| P01 | Tamamlandı | Raf okuyucusundaki açık bölümü açık bir eylemle sesli üretimde aç; üretimden kitaba dön. | EPUB kaynak kimliği/spine veya doğrulanmış PDF sayfası eşleşir; kaynak değişmiş/eksikse yanlış bölüme sessiz geçiş yapılmaz. EskiN39. |
| P02 | Bekliyor | Takipli okuyucuda sayfa/pasaj yer imi; yer iminden doğru bölüm ve ses konumuna dön. | Kalıcı kitap/bölüm/metin kimliği, bölüm değişimi ve metin düzenlemesinde eski konumun dürüst gösterimi. EskiN37. |
| P03 | Bekliyor | PDF'den gelen bölünmüş sözcükleri isteğe bağlı hazırlama önizlemesinde ele al. | Değişiklikler önce/sonra gösterilir, tek tek seçilebilir; özel ad/kısaltma/sayısal aralık korunur; özgün PDF değişmez. EskiN32. |
| P04 | Bekliyor | Aynı metnin ses denemelerini karşılaştırıp uygun denemeyi seç. | Önceki çıktı silinmez; farklı metin sürümü güncelmiş gibi onaylanmaz; karşılaştırma ve seçim dinleme UI'ından yapılır. EskiN30. |
| P05 | Bekliyor | Üretim öncesi güncel konuşma gruplarını ve metindeki değişiklikleri görünür yap. | Kaynak/plan kimliği sabittir; eski key başka parçayı hedeflemez; önbellek tekrar kullanımı ölçülmeden kesin sayı/hız vaat edilmez. EskiN41/N43 ve mevcut onarımların devamı. |
| P06 | Bekliyor | Kalite ve iş durumlarını anlaşılır EN/TR etiketleriyle göster. | Ham review/failed kodları yerine açık etiket; dil değişince kullanıcı metni çevrilmez; durdurma/timeout/gerçek hata ayrımı korunur. EskiN45. |
| P07 | Bekliyor | Dar ekran ve yüksek DPI'da okuyucu/kalite/üretim düğmelerini erişilebilir tut. |800px ve125% kontrolü, klavye odak sırası, iç içe kaydırma ve düğme örtüşmesi için gerçek görüntü/etkileşim. EskiN29/N33. |
| P08 | Bekliyor | Uzun kitap export'u ve tekrar aç/kapat kullanımında gerçek kaynak maliyetini ölçüp gerekirse düzelt. |100bölüm M4B'de argv/süre/bellek/süreç tanıtıcısı; okuyucu tekrarlarında listener/süreç kapanışı; sayı tek başına bug sayılmaz. EskiN10/N15/N46. |
| P09 | Bekliyor | Seçili pasajı açıklama/özetleme gibi asistan eylemlerini doğru kitap bağlamıyla kolaylaştır. | Komutun kaynağı görünür; başka sayfa/kitap/önceki seçim kullanılmaz; sayfa çevirisi gibi mevcut araçlar gerektiğinde çağrılır. Mevcut seçili pasaj bağlamı tekrardan yazılmaz. |
| P10 | Bekliyor | Uygun boş GPU'da kısa gerçek dublaj örneğiyle son ses/kelime bütünlüğünü ve aşama sürelerini kontrol et. | Aynı kısa metin/referansla kayıtlı ayarlar, gerçek çıktı ve süre/eksik okuma kanıtı; kişisel iş kesilmez. GPU/başvuru sesi uygun değilse açık engel kaydedilir, mock gerçek kalite diye sunulmaz. |

## Yürütme ve teslim

İlk iş P01: `backend/media_shelf.py` kaynak kimliği, `src/media-workflows.js`, `src/renderer/media-shelf-ui.js` okuyucusu ve `MediaWorkflowsUI.openProject` yolunu karşılaştır. Sonraki işler tablodaki sırayla, doğrulanan kullanıcı etkisine göre gruplanabilir. Her satırda kanıt ve ürün commit'i kaydedilir. İnceleme maddesinde kod değişikliği gerekmiyorsa mevcut davranış/ölçüm kanıtı gerekir; yalnız plan veya spekülasyon tamamlanma değildir.

Kısa hedefli kontroller; UI'da mevcut tema ve gerçek Windows görüntüsü. Tüm CI'ın sonucunu bekleme, bilinen başarısızlığı gizleme. Ürün/belge commitleri ayrı, normal push ve PR487; otomatik master merge yok. Kişisel uygulamayı kapatma, kullanıcı dosyası/anahtarı yayımlama, ücretli API kullanma. Bağımlılık/model yükseltmesini ihtiyaç olmadan yapma.

Eski `NIGHT_WORK_2026-10-25.md` tarihsel kanıt ve kalan düşük öncelikli işler olarak korunur; onun bitmiş satırları yeniden yapılmaz. Özellikle eskiN47 Letterboxd gerçek rota doğrulamasıdır; kitap asistanıyla karıştırılmaz. Bu hedef bitince kapsam baştan kanıtla denetlenir; yalnız kolay maddelerin bitmesi tüm hedefin tamamlandığı anlamına gelmez.

25 Ekim11:55 devam uyanışı aynı aktif hedefi çoğaltmadan son kontrol noktasını kullanmalıdır; yeni paralel iş/oturum başlatılmaz. Günlük durum gerekmiyorsa sessiz kal, anlamlı teslim veya gerçek engelde bildir.

## P01 kanıtı —12:11
Ürün4ab4677a58f1bba4f5e256ddd58183b048665dab/Rapor568.9hedefliPASS/nativeWindowsgerçekEPUBikinci bölümgidişdönüş+PDFpage2exit0görüntüincelendi; GPU otomatikbaşlamaz. BulunanmainwriterimportvekitaplararasıvoicePrefs hatasıdadüzeldi. Size/mtimekaynak kontrolü; eski kaynakkimliğiyokvedüzenlenmişmetin eşleştirilmez. Sonraki P02 yerimi/gerçekkonum ve metinsürümü; P03hazırlamaönizlemesi. P02–P10henüztamamdeğil.
