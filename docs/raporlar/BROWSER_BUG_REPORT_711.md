# Rapor711 — Canlı modelden gerçek Windows kartına ve eski hata bandı

Başlangıç7280376bcf3f6e962042ad9ac47b300ce1f7de6b. Bitiş ürün/testd0704cb9c43c02acf7b377f7c7314fb342e95410. Müzik kapsam dışıdır; kalan90hedef sürer.

## Canlı entegrasyon
Yeni tools/assistant-deepseek-native.cjs yalnız açık --live-deepseek seçeneğiyle gerçek DeepSeekV4.1standardAPI kullanır. Önceki R710'dan farklı olarak ana süreç/renderer/overlay/gerçek ayar kontrolleri/güvenli test ayarı kaydı/onay köprüsü gerçek uygulama kodudur; uygulama adaptörleri taklit edilmedi. Ayrı Windows test profili ve sentetik anahtar kullanıldı. Gerçek anahtar sadece doğru kişisel şifreleme profilini salt okunur açan ayrı broker sürecinden anonim NodeIPC ile belleğe gelir; yalnız outbound DeepInfra Authorization başlığında kullanılır. Kişisel kasa veya ayarlar test profiline kopyalanmaz/değiştirilmez. Broker IPC kanalı olmadan çalışmaz; stdout/stderr'e anahtar yazmaz.

Son koşum14gerçekHTTPisteği ve3gerçek uygulanmış kart:
- large-v3/beam5→tiny/beam3: UI ve test settings disk kaydı doğrulandı.
- Whisper undo→large-v3/beam5; ilgisiz batchSize devre dışıyken geri alma çalıştı ve disabled durumu korundu.
- Tekrar tiny/beam3 uygulandı.
- Model kullanıcı müdahalesiyle base yapıldığında önce hazırlanmış beam6 kartı reddedildi; base/beam3 korundu, üretim başlamadı.
- ENlight800x800yeni kart base→tiny, beam3→3 görüntülendi. Son görsel gerçek güncel karta kaydırıldı.

[Gerçek son koşum JSON ve görüntüleri](NATIVE711_2026-10-28/). Önceki iki başarılı canlı kabul14ve15istekti; bunlar yeni özellik/ayrı bug sayılmadı. İlk izole profilde güvenli kayıt açılamadı; ilk koşu kart bekleme timeout'u verdi. Test kurulumu doğru profilde ayrı okuma ve IPC ile düzeltildi; ürün bugı diye raporlanmadı. Gerçek anahtar hiçbir dosya,komut satırı veya yayımlanan görüntüye yazılmadı. Normal test/CI otomatik ücretli API çağırmaz.

## Yeni doğrulanmış ürün hatası
İlk canlı ENlight görüntüsünde eski başarısız kartın `İşlem ayarları değişti; yeniden isteyin.` hata bandı, yeni başarılı istek/karttan sonra da üstte duruyordu. global-assistant.js toolNotice yalnız bazı başarılı eylemlerde temizleniyor, yeni kabul edilmiş soruda korunuyordu. Bu hem yanlış güncel hata izlenimi hem dil değiştirilince eski dilde bant oluşturuyordu.

Artık yalnız aynı kaynağa kabul edildiği doğrulanan yeni soru toolNotice'ı temizler. Reddedilen gönderim uyarıyı silmez; gerçek workspace kayıt hatası ayrı önceliğini ve başarısız kartın kayıtlı sonucu geçmişte yerini korur. Kartlar silinmez; ayarlar/üretim davranışı değişmez.

## Kanıt ve kontroller
Yeni tests/assistant-conversation.test.js regresyonu düzeltme öncesi `Previous tool failed !== ''` ile kırmızı; sonra geçiyor. Conversation+overlay7NodePASS; syntax/diff PASS. Son canlı native kabul ayrıca yeni karttan sonra workspaceError boşluğunu assert eder. Yeni EN kartı ve önceki hata bandı görüntüsü karşılaştırılarak incelendi. Açık seçenek verilmeden native test aracı exit2 ile ücretli isteğe başlamayı reddetti.

Komutlar:
```powershell
node --test --test-isolation=none tests/assistant-conversation.test.js tests/assistant-overlay.test.js
& '.\node_modules\electron\dist\electron.exe' tools/assistant-deepseek-native.cjs --live-deepseek
```
Bu son komut canlı ücretli API ve sentetik test profilinde gerçek ayar/onay işlemleri yapar; yalnız ilgili açık kullanıcı yetkisiyle çalıştırılır.30HTTP/koşu,60snistek,90snUIbekleme,300sngenel sınırı vardır. Test çıktıları ignore edilmiş .uiprev altında; yalnız temiz kanıtlar rapora seçildi.

## Kaynak incelemesi ve sınır
Mevcut native654 ve live710 araçları/provider/kasa kodu yeniden kullanıldı. [TanStack MutationObserver](https://github.com/TanStack/query/blob/main/packages/query-core/src/mutationObserver.ts) yeni işlemin önceki observer durumundan ayrılması/reset deseni ve [MIT lisansı](https://github.com/TanStack/query/blob/main/LICENSE) incelendi. Sadece desen karşılaştırması; paket veya dış kod eklenmedi. Yeni IPC uygulama yetkisi/kalıcı şema/dependency yok; broker test sürecine özeldir.

Gerçek Whisper/GPU/dublaj üretimi, farklı sağlayıcı/hesap, canlı video/site/DRM, install.bat/start.bat bu turda çalışmadı. WindowsnativeElectron testi normal start.bat açılışı sayılmaz.11before-quit listener uyarısı ve izole ağdaki reklam filtresi isteği reddi açık; reklam engelleme doğrulaması değil. CI beklenmez. P071/P072/P073/P097 kanıtları dar kapsamlarıyla güncellendi; bütün ekran ve komutlar tamamlanmış sayılmadı.
