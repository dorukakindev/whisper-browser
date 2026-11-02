# R844 doğrulama ve araştırma ayrımı

2 Kasım 2026. Başlangıç master `dedfaee8e4e5cca07abc90206c447123e31cdce0` (PR793 sonrası).

## Yedi bulgunun güncel durumu
| Kayıt | Sonuç |
|---|---|
| R844-01 | Doğrulandı/düzeltildi. Belirsizlik kapısı ilk soru yerine gerçekten teslim edilmiş son insan yönlendirmesinin sürümlü niyetini kullanır. Eski açık talep sonraki belirsiz talebi otomatik açmaz; kaynak metni insan talimatı olmaz. |
| R844-02 | Doğrulandı/düzeltildi. Özgün sese dönüş altyazı çıktısı gerektirmez. Bekleyen, bitmiş veya başarısız çeviri kurtarma kartını engellemez. Kaynak/sohbet/onay/tek kullanım denetimleri ve gerçek üretim önkoşulları korunur. |
| R844-03 | Doğrulandı/düzeltildi. Toplu okundu geri alması önceki readSnapshot ve correctionAcknowledgedRevision değerlerini, yokluklarını da koruyarak döndürür. Sonraki kaynak revizyonu/manuel okuma/onay eski undo ile ezilmez. |
| R844-04 | Doğrulandı/düzeltildi. Birleştirilmiş yazıda görünen film bağını kaldırma, aynı kanonik yazının fiziksel kopyalarındaki yalnız o katalog kimliğini kaldırır. Başka yazı veya başka film bağı korunur. |
| R844-05 | Doğrulandı/düzeltildi. Atom XHTML paragraf, liste, br ve summary sınırları korunur; script/style/template çıkarılır. Ham HTML render edilmez. |
| R844-06 | Doğrulandı/düzeltildi. Sağlayıcı sunum başlığı ile yerel katalog hedefi ayrıldı. Aynı IMDb/kind altındaki Türkçeleştirilmiş ad koleksiyon işlemini engellemez; yerel ad ezilmez. Farklı hedef/sonradan düzenleme hâlâ reddedilir. |
| R844-07 | Önceki PR793'te zaten düzeldi. Kayıtlı yıl görünümünde görünmeyen tür uygulanmaz; hedefli test yeniden geçti. Yeni düzeltme sayılmadı. |

Çapraz incelemede koleksiyon ensure-record ile plan arasındaki hedef değişikliği de kapatıldı: renderer incelenen hedef imzalarını plan isteğine bağlar; ana süreç plan oluşturmadan kontrol eder; sonraki apply mevcut identity denetimini sürdürür. Sadece renderer karşılaştırmasına güvenilmez.

## Doğrulama
15 ilgili test dosyasıyla tek son koşuda **127 PASS / 0 FAIL**, 2.65 saniye. Asistanın sonradan steer/follow-up teslimi, failed continuation restore, foreign-thread/replay reddi; gerçek RSS store/parser, eski okuma tabanı ve kanonik ilişki; yerel/sağlayıcı başlığı ve koleksiyon plan yarışı regresyonları kapsandı. Yeni davranış testleri düzeltme öncesinde kusuru üretti. Değişen JS syntax ve `git diff --check` geçti.

Çalıştırma: `node --test --test-isolation=none tests/assistant-agent-service.test.js tests/four-assistant-mechanisms.test.js tests/assistant-flows.test.js tests/assistant-flow-state.test.js tests/assistant-collections.test.js tests/r844-feed-regressions.test.js tests/feed-parser.test.js tests/feed-store.test.js tests/feed-service.test.js tests/feed-ui.test.js tests/r843-feed-podcast.test.js tests/discovery-personal-workflows.test.js tests/media-discovery-service.test.js tests/discovery-result-state.test.js tests/open-package-assistant-feeds.test.js`.

Bu paket arayüz kompozisyonu/CSS değiştirmez; koleksiyon renderer'ında yalnız hedef doğrulaması değişir. Yeni görsel başarı iddiası veya tekrarlı native tasarım turu yok. Gerçek DeepSeek, gerçek feed/Letterboxd, kişisel profil, start.bat, GPU/DRM bu turda çalıştırılmadı. Tam npm test ve Actions çalıştırılmadı. Önceki Windows kanıtları tarihsel olarak PR793 tesliminde durur; bu kod için yeni native sonuç sayılmaz.

## Araştırmalar
[Yedi alanın 28 kartı ve derin asistanın 17 kartı: 45 kayıt](RESEARCH-CARDS.md) gerçek sahip modüllerle karşılaştırıldı. 13 kısmen mevcut, 13 küçük yararlı sonraki dilim, 19 önce bağımlılık/ürün sınırı çözülmesi gereken iş. Bunlar uygulanmış özellik değildir. Sınıflandırma gelecekteki çalışmayı dışlamaz.

İlk önerilen uygulama kümesi M03-01+K05: insan mesajı anının zaman/altyazı/iz revizyonu makbuzu ve o gerçek veriye bağlı birimli süre hesabı. Sonra K01+K04: aynı tipli koşulla liste ve gerçek toplam. Mevcut arama/RRF/onay/iş bağları yeniden yazılmamalı.

Özgün yerel araştırma dosyaları ve R844 değiştirilmedi, yayımlanmadı. Bu tur üçüncü taraf kod/bağımlılık/framework taşınmadı; yalnız rapor bulguları güncel sahip kodda doğrulandı. Üç GPT-6.1 Sol medium ajanı onarım/araştırma/çapraz incelemede kullanıldı. `superpowers:receiving-code-review` doğrula-sonra-uygula yaklaşımı izlendi.
