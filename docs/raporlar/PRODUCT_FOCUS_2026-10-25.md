# Yeni ürün hedefi — kitap, okuyucu ve dublaj

Kullanıcı25 Ekim2026'da yeni çalışma hedefi belirlememi istedi. Bu plan yeni aktif hedef olarak kaydedildi; önceki listenin bitmiş olduğu iddia edilmez. Başlangıç dalı `codex/book-reliability549`, HEAD `abc05762fe9278a4a0dcafee974dfc3a5cd317dc`, teslim PR487. Yedek/kurtarma bakımını genişletme talebi yok; kullanıcı bu alanı erteledi. Yeni hedef doğrudan kullanıma odaklanır.

| ID | Durum | Kullanıcıya sağlanacak sonuç | Tamamlanma kanıtı |
|---|---|---|---|
| P01 | Tamamlandı | Raf okuyucusundaki açık bölümü açık bir eylemle sesli üretimde aç; üretimden kitaba dön. | EPUB kaynak kimliği/spine veya doğrulanmış PDF sayfası eşleşir; kaynak değişmiş/eksikse yanlış bölüme sessiz geçiş yapılmaz. EskiN39. |
| P02 | Tamamlandı | Takipli okuyucuda sayfa/pasaj yer imi; yer iminden doğru bölüm ve ses konumuna dön. | Kalıcı kitap/bölüm/metin kimliği, bölüm değişimi ve metin düzenlemesinde eski konumun dürüst gösterimi. EskiN37. |
| P03 | Tamamlandı | PDF'den gelen bölünmüş sözcükleri isteğe bağlı hazırlama önizlemesinde ele al. | Değişiklikler önce/sonra gösterilir, tek tek seçilebilir; özel ad/kısaltma/sayısal aralık korunur; özgün PDF değişmez. EskiN32. |
| P04 | Tamamlandı | Aynı metnin ses denemelerini karşılaştırıp uygun denemeyi seç. | Önceki çıktı silinmez; farklı metin sürümü güncelmiş gibi onaylanmaz; karşılaştırma ve seçim dinleme UI'ından yapılır. EskiN30. |
| P05 | Tamamlandı | Üretim öncesi güncel konuşma gruplarını ve metindeki değişiklikleri görünür yap. | Kaynak/plan kimliği sabittir; eski key başka parçayı hedeflemez; önbellek tekrar kullanımı ölçülmeden kesin sayı/hız vaat edilmez. EskiN41/N43 ve mevcut onarımların devamı. |
| P06 | Tamamlandı | Kalite ve iş durumlarını anlaşılır EN/TR etiketleriyle göster. | Ham review/failed kodları yerine açık etiket; dil değişince kullanıcı metni çevrilmez; durdurma/timeout/gerçek hata ayrımı korunur. EskiN45. |
| P07 | Tamamlandı | Dar ekran ve yüksek DPI'da okuyucu/kalite/üretim düğmelerini erişilebilir tut. |800px ve125% kontrolü, klavye odak sırası, iç içe kaydırma ve düğme örtüşmesi için gerçek görüntü/etkileşim. EskiN29/N33. |
| P08 | Tamamlandı | Uzun kitap export'u ve tekrar aç/kapat kullanımında gerçek kaynak maliyetini ölçüp gerekirse düzelt. |100bölüm M4B'de argv/süre/bellek/süreç tanıtıcısı; okuyucu tekrarlarında listener/süreç kapanışı; sayı tek başına bug sayılmaz. EskiN10/N15/N46. |
| P09 | Tamamlandı | Seçili pasajı açıklama/özetleme gibi asistan eylemlerini doğru kitap bağlamıyla kolaylaştır. | Komutun kaynağı görünür; başka sayfa/kitap/önceki seçim kullanılmaz; sayfa çevirisi gibi mevcut araçlar gerektiğinde çağrılır. Mevcut seçili pasaj bağlamı tekrardan yazılmaz. |
| P10 | Açık — GPU meşgul | Uygun boş GPU'da kısa gerçek dublaj örneğiyle son ses/kelime bütünlüğünü ve aşama sürelerini kontrol et. | Rapor577: ayrı eğitim işi/5476MiB boş; üretim başlatılmadı. Gerçek kabul aracı ve engel kapısı hazır, gerçek ses/kelime/ton henüz doğrulanmadı. |

## Yürütme ve teslim

İlk iş P01: `backend/media_shelf.py` kaynak kimliği, `src/media-workflows.js`, `src/renderer/media-shelf-ui.js` okuyucusu ve `MediaWorkflowsUI.openProject` yolunu karşılaştır. Sonraki işler tablodaki sırayla, doğrulanan kullanıcı etkisine göre gruplanabilir. Her satırda kanıt ve ürün commit'i kaydedilir. İnceleme maddesinde kod değişikliği gerekmiyorsa mevcut davranış/ölçüm kanıtı gerekir; yalnız plan veya spekülasyon tamamlanma değildir.

Kısa hedefli kontroller; UI'da mevcut tema ve gerçek Windows görüntüsü. Tüm CI'ın sonucunu bekleme, bilinen başarısızlığı gizleme. Ürün/belge commitleri ayrı, normal push ve PR487; otomatik master merge yok. Kişisel uygulamayı kapatma, kullanıcı dosyası/anahtarı yayımlama, ücretli API kullanma. Bağımlılık/model yükseltmesini ihtiyaç olmadan yapma.

Eski `NIGHT_WORK_2026-10-25.md` tarihsel kanıt ve kalan düşük öncelikli işler olarak korunur; onun bitmiş satırları yeniden yapılmaz. Özellikle eskiN47 Letterboxd gerçek rota doğrulamasıdır; kitap asistanıyla karıştırılmaz. Bu hedef bitince kapsam baştan kanıtla denetlenir; yalnız kolay maddelerin bitmesi tüm hedefin tamamlandığı anlamına gelmez.

25 Ekim11:55 devam uyanışı aynı aktif hedefi çoğaltmadan son kontrol noktasını kullanmalıdır; yeni paralel iş/oturum başlatılmaz. Günlük durum gerekmiyorsa sessiz kal, anlamlı teslim veya gerçek engelde bildir.

## P01 kanıtı —12:11
Ürün4ab4677a58f1bba4f5e256ddd58183b048665dab/Rapor568.9hedefliPASS/nativeWindowsgerçekEPUBikinci bölümgidişdönüş+PDFpage2exit0görüntüincelendi; GPU otomatikbaşlamaz. BulunanmainwriterimportvekitaplararasıvoicePrefs hatasıdadüzeldi. Size/mtimekaynak kontrolü; eski kaynakkimliğiyokvedüzenlenmişmetin eşleştirilmez. Sonraki P02 yerimi/gerçekkonum ve metinsürümü; P03hazırlamaönizlemesi. P02–P10henüztamamdeğil.

## P02 kanıtı — 12:34
Ürün `6579a715f68e27af78879cae95b9ea32dc262295`, Rapor569. 18 hedefli PASS; ayrı profilde native Windows exit0 (`.uiprev/book-reliability549-1792920743462`), gerçek pasaj seçimi/bölüm dönüşü/yeni ses grup başlangıcı/metin değişimi. Görüntüler incelendi. Yeni bağımlılık yok; opsiyonel bookmarks alanı. Gerçek GPU/TTS/canlı API doğrulanmadı. Sıradaki P03 hazırlama önizlemesi, ardından P04 ses denemeleri; P03–P10 açık.

## P03 kanıtı — 12:37
Ürün `c5777ab4cd967c29ece8a8ba112c64d734c6f7a4`, Rapor570. PDF bölüm editöründe seçimsiz öneriler, tek tek birleştirme/tire koruma, bayat snapshot engeli ve taslak geri alma. 8 hedefli PASS; Windows native exit0 `.uiprev/book-reliability549-1792920999543`, gerçek UI kaydet/geri al ve kaynak PDF SHA256 değişmezliği. Görüntü incelendi. Sözlük/özel ad tanıma değildir; büyük harfli sözcükler ve sayılar önerilmez. Sıradaki P04 ses denemelerini karşılaştırma; P04–P10 açık.

## P04 kanıtı — 12:49
Ürün `60009a2bf4f13bde4554469387dd829514243b7d`, Rapor571. Ses denemesi metadata kimlikleri, iki kayıt karşılaştırması, tek ses çalma, eski metni seçme engeli ve eski dosyaları silmeden açık seçim. 16 hedefli PASS; Windows native exit0 `.uiprev/book-reliability549-1792921687459`, gerçek kontrollü WAV/UI seçimi ve geri seçim; görüntü incelendi. Son eksik-dosya ayrımı hizmet testinde tekrar geçti. Aktif + yakın 30 metadata, daha eski dosyalar korunur; eski sahipsiz WAV geçmişi tahmin edilmez. Gerçek TTS/GPU henüz sınanmadı. Sıradaki P05 güncel grup planı; P05–P10 açık.

## P05 kanıtı — 12:55
Ürün `95f3a01ed984cd7f1e704be37cb88b5e00133fe8`, Rapor572. Gerçek model yüklemeyen planlayıcı, metin/tekrar karşılaştırması, taslakta eski grupları kaldırma ve üretim öncesi text/source hash kontrolü. 15 hedefli PASS; Windows native exit0 `.uiprev/book-reliability549-1792922099611`, gerçek Python planı, project.json byte eşitliği, düzenlemede token geçersizliği; görüntü incelendi. Önbellek/hız/gerçek ses süresi iddiası yok. Sıradaki P06 durum etiketleri; P06–P10 açık.

## P06 kanıtı — 13:05
Ürün `a45e2d79d49f5805a120a378125bc9379c4ad505` (ana durum onarımı `b4cca930944f4c1ecc434381478f09949944cba1`), Rapor573. EN/TR kalite/aşama, boş error ile cancelled ayrımı, timeout ayrıntısı korunması ve metin geri alınınca doğru hazır/review durumu. 12 hedefli PASS; son backend onarımı sonrası 8 hedefli PASS. Windows native exit0 `.uiprev/book-reliability549-1792922545829`: kontrollü IPC olayları ve locale değişiminde metin korunması; görüntüler incelendi. Gerçek motor timeout/GPU/TTS doğrulaması değildir. Sıradaki P07 dar ekran ve %125 kontrolü; P07–P10 açık.

## P07 kanıtı — 13:14
Ürün `4b8c42e207b12043b9c12e5e16552a07c31a12f9`, Rapor574. Dar ekranda tek sütun/tam genişlik editör, akışlı kalite/işlem alanı ve odak stilleri. Windows native exit0 `.uiprev/book-reliability549-1792923217450`:800×900/%100 ve%125, gerçek640×720viewport/DPR1,25; altı ekranda48 kaydırma sonrası hit ölçümü, taşma0; gerçekTab ve PDFfaretekerleği. Görüntüler incelendi;14 hedefli PASS. OS DPI/çoklu monitör değil; normal uygulama min940 değişmedi. Sıradaki P08 100bölüm/kaynak ölçümü; P08–P10 açık.

## P08 kanıtı —13:31
Ürün `e80ebdefcfe293e59d46a74e27e113cf9366c1db`, Rapor575. Gerçek100×1sn PCM→M4B/tamdecode/100başlık; aynı WAV formatlarında ardışık yol:206→21thread,1417→258handle,argv224→28; farklıformat fallback ve gerçekiptal temizliği geçti. Süre4,66→4,45sn tek koşum, genel hız garantisi değil.14 hedefli PASS; nativeWindows exit0 `.uiprev/book-reliability549-1792924009107`:12reader döngüsünde DOM/listener sabit, kapalıreader kaynakları temiz. Gerçek TTS/GPU değil. Sıradaki P09 kitap asistanı eylemleri ve P10 gerçek kısa dublaj; açık kalanlar bunlar.

## P09 kanıtı —16:15
Ürün `b50db2b3472b1d942638d7237bb485a579237441`, Rapor576. Üretim/sesli reader/PDF/EPUB asistan eylemleri, tam bölüm100k sınırı, kaydedilmemiş taslak, SHA256revision ve kaynak değişiminde istek/geç yanıt reddi.16hedefliNode+1backendprompt PASS. Özel nativeWindows `.uiprev/book-assistant-1792934100518` exit0:5kontrollüistek ve10723karaktertam taslak; genel kitap native `.uiprev/book-reliability549-1792933779489` exit0/12döngüDOMsabit. Görüntülerincelendi. Gerçek sağlayıcı kalitesi/GPU/TTS değil. Kullanılmış11:55tek-sefer uyanış silindi; aktif hedef sürüyor. Son açık P10 gerçek kısa dublaj; ardından tam hedef kanıt denetimi ve PR açıklaması.
