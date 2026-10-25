# Rapor 573 — Açık kalite, aşama ve hata durumları

P06, 25 Ekim 2026. Başlangıç `8310ff8f3b03fe504e158aad61edcd58d6960073`; ana ürün commiti `b4cca930944f4c1ecc434381478f09949944cba1`, son ürün `a45e2d79d49f5805a120a378125bc9379c4ad505`. Dal `codex/book-reliability549`, PR487.

## Doğrulanan sorunlar ve onarımlar

Kitap üretiminde ayrıntısız `error` olayı, `cancelled` ile aynı fallback mesajını kullanıp **Durduruldu** gösterebiliyordu. Artık yalnız iptal olayı durdurma özetini kullanır. Hata başarısız olarak gösterilir; tanınan timeout/TimeoutError/timed out/zaman aşımı ayrıntılarında zaman aşımı özeti kullanılır. Özgün hata ayrıntısı kaybolmaz. Bu özetleme bütün olası yabancı dil hata ifadelerini tanıyan bir sınıflandırıcı değildir; bilinmeyen hata başarısız kalır ve ayrıntısı gösterilir.

Review satırları ham `review/failed` kodu gösteriyordu; bölüm listesinin bilinmeyen/failed durumu da Pending'e düşüyordu. Artık EN/TR kalite etiketleri ve bilinmeyen-durum fallback'i var. Bu yalnız UI etiketidir; grup metni/kullanıcı verisi çevrilmez veya kalite onayı değiştirilmez. Dil değişiminde mevcut kalite/aşama etiketleri yeniden hesaplanır; taslak/ses oturumu yeniden oluşturulmaz.

Kitap olay işleyicisi aşama olaylarını göstermediği için doğrulama/yazma/dengeleme sırasında yalnız son sayı kalabiliyordu. Dublaj servisinin status olayları opsiyonel anlamsal `stage` taşır; mevcut text korunur. Kitap UI'ı model yükleme, grup planı, sentez, doğrulama, yerleştirme, dosya yazma ve dengeleme etiketlerini gösterir. Eski stage'siz durumlarda ayrıntı metni korunur. Sıfır ilerleme değeri başka current değeriyle yanlış değişmez.

Ek gerçek durum onarımı: metin düzenlenip özgün sesin tam metnine geri döndürüldüğünde book-save hâlâ pending bırakıyordu. Güncel metin mevcut çıktı textHash'iyle tekrar tam eşleşirse gerçek grup durumundan ready/review geri hesaplanır; review kendiliğinden onaylanmaz. Reader'dan editöre dönünce eski yer imi durum mesajı da temizlenir.

## Dosyalar

`src/book-workflow-status.js`: sınırlı EN/TR kalite/aşama ve terminal özetleri. `src/dub-service.js`: eski event sözleşmesini koruyarak stage alanı. `src/renderer/media-workflows-ui.js`: kalite etiketleri, aşama/terminal ayrımı, veri değiştirmeden locale güncellemesi. `index.html`: yerel script. `src/media-workflows.js`: geri alınmış metinde mevcut sesin gerçek kalite durumu. Üç mevcut test ve yeni book-workflow-status testi; native smoke'a kontrollü IPC/locale kontrolleri ve book-voice-takes testine metin geri alma senaryosu.

## Kanıt ve sınırlar

12 hedefli PASS: book-workflow-status, book-regenerate-request, dub-service, book-production-plan, csp-policy. Son backend metin geri alma onarımı sonrası 8 hedefli PASS: book-voice-takes, book-reliability, book-workflow-status, book-regenerate-request. Syntax/diff temiz.

Windows ayrı profil native `.uiprev/book-reliability549-1792922545829`, exit0: gerçek renderer/preload üzerinden kontrollü verification/error/timeout/cancelled olayları; yanlış durdurma mesajı yok; EN/TR aşama ve review etiketi güncellenirken textarea byte-aynı; önceki kitap/PDF/EPUB/M4B/yer imi/deneme akışları. Görüntüler incelendi. Bu gerçek motor timeout'u/iptali kanıtı değildir; event sınırı kontrollüdür. Native sonrası yalnız TimeoutError/başka prototip isimli bilinmeyen kod koruması ve metin geri alma backend onarımı yapıldı; hedefli testler geçti.

Dil canlı güncellemesi burada kalite/aşama etiketleriyle sınırlı; tüm mevcut dialog eylemlerinin anında dil değiştirdiği iddia edilmez. Kullanıcı metni UI çeviricisine sokulmaz. Gerçek GPU/TTS/API/kişisel start.bat, tam paket ve CI çalıştırılmadı. Yeni bağımlılık/kurulum/kalıcı şema yok; status event'e opsiyonel stage eklenir. P06 tamam; P07–P10 açık. Master merge yok.
