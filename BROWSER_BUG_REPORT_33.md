# BROWSER BUG REPORT 33 — Canlı altyazı çevirisi 0/N hata

Tarih: 2026-09-15
Başlangıç commit'i: `3890525b46e737fe6dc68f7b4257c0e8d05d40af`
Düzeltme commit'i: `7a92bbd`

## Kullanıcı kanıtı

Great Courses videosunda kaynak altyazılar yakalanmış ve sağ panelde görünürken üst şerit `Canlı çeviri tamamlanamadı: 0/2 cümle hazır · 2 hata.` bildiriyordu. Görüntü, yakalama katmanının çalıştığını; başarısızlığın canlı çeviri yolunda olduğunu kanıtlıyor. Ekran görüntüsü tek başına sağlayıcının gerçek HTTP hata kodunu veya mesajını göstermediği için model, anahtar ya da kota hakkında kesin neden çıkarılmadı.

## Doğrulanmış bulgular

### B33-01 — Tamamlanmamış canlı cümle erken çevriliyordu — P2 — DÜZELTİLDİ

`assembleCueSentences` kaynak izin tamamlanıp tamamlanmadığını bilmiyor ve noktalama ile bitmeyen son cue grubunu her çağrıda cümle olarak yayımlıyordu. Büyüyen izde yeni cue geldikçe aynı yarım cümle değişiyor, çalışan istek iptal edilip yeniden kurulabiliyor ve bağlamsız/eksik çeviri istekleri oluşuyordu.

Düzeltme: `sourceComplete: false` durumunda son yarım grup bekletiliyor. Cümle sonu geldiğinde veya süre/parça/karakter güvenlik sınırı dolduğunda grup yayımlanıyor. İlk yakalamada hiç tamamlanmış cümle yoksa oturum hata ile kapanmıyor; boş canlı scheduler sonraki cue güncellemesini bekliyor.

### B33-02 — Kalıcı sağlayıcı hataları üç kez yineleniyordu — P2 — DÜZELTİLDİ

Scheduler tüm hataları geçici kabul ediyordu. Eksik API anahtarı, güvenli olmayan endpoint ve HTTP 400/401/403 gibi kullanıcı müdahalesi gerektiren yanıtlar da üç denemelik backoff tüketiyordu.

Düzeltme: hata nesnesine `retryable` sınıfı taşındı. 408, 425, 429 ve 5xx geçici kalmaya devam ediyor; yapılandırma hataları ile diğer kalıcı 4xx yanıtları ilk denemede terminal oluyor. Kullanıcı ayarı düzelttikten sonra mevcut `Hatalıları yeniden dene` eylemi kullanılabilir.

### B33-03 — Üst durum şeridi gerçek hata nedenini gizliyordu — P2 — DÜZELTİLDİ

Renderer yalnız hata sayısını gösteriyor, ayrıntılı neden yalnız genel günlükte kalıyordu. Bu yüzden geçersiz anahtar, model bulunamadı, kota ve şema hataları aynı `2 hata` mesajına dönüşüyordu.

Düzeltme: sağlayıcının yapılandırılmış hata mesajı en fazla 64 KiB gövdeden okunuyor, 240 karaktere sınırlandırılıyor; URL/anahtar/token/yol ve eşleşen kaynak altyazı metni gizleniyor. Son güvenli neden üst durum şeridinde `Son hata:` olarak gösteriliyor.

## Reddedilen veya açık kalan iddialar

- “Altyazı yakalama çalışmıyor” reddedildi: görüntüde kaynak cue'lar zamanlarıyla görünür.
- “CodeCraftAPI anahtarı/modeli kesin hatalı” doğrulanamadı: görüntüde HTTP kodu veya sağlayıcı mesajı yok; gerçek anahtar okunmadı ve ücretli canlı çağrı yapılmadı.
- Harici sağlayıcının erişilebilirliği ve `gemini-3.7-flash` hesabına açık olup olmadığı bu turda kanıtlanmadı. Yeni sürüm gerçek nedeni güvenli biçimde gösterecek; o bilgiyle sağlayıcıya özel kalan sorun ayrıca doğrulanabilir.

## Doğrulama

- `node --check src/browser-translation-scheduler.js` — geçti.
- `node --check src/main.js` — geçti.
- `node --check src/renderer/renderer.js` — geçti.
- Hedefli testler: cümle sınırı, ana süreç refresh, scheduler kalıcı hata ve UI nedeni — geçti.
- `npm test` — çıkış 0; son satır `Tüm testler geçti`; Python `backend/test_transcribe.py` 178/178.
- `npm run test:electron-bridge` — çıkış 0.
- Gerçek Great Courses oturumu bu turda yeniden çalıştırılmadı; kullanıcı profilindeki anahtar veya oturum verileri okunmadı.

## Ayrıntılı bulgu, düzeltme, ret gerekçesi ve doğrulama dökümü

Kaynak yakalama başarılı olmasına rağmen canlı çeviri, büyüyen izin henüz tamamlanmamış son parçasını bağımsız cümle sanıyordu. Buna sağlayıcı hatalarının ayrım yapılmadan üç kez yinelenmesi ve UI'ın yalnız toplam hata sayısını göstermesi eklenince kullanıcı neyin bozulduğunu göremiyor, aynı eksik içerik gereksiz istekler üretebiliyordu. Kaynak-tamamlık bilgisi artık cümle birleştiriciye taşındı; yarım kuyruk kararlı sınır oluşana kadar bekliyor ve boş başlayan canlı oturum açık kalıyor. Kalıcı/geçici hata ayrımı scheduler'a kadar korunuyor. Sağlayıcının hata nedeni yalnız yapılandırılmış alandan, boyut ve gizlilik kapılarından geçirilerek gösteriliyor. Yakalamanın bozuk olduğu iddiası görüntüdeki cue'lar nedeniyle reddedildi; CodeCraftAPI/model/anahtar hakkında kesin hüküm ise ham sağlayıcı yanıtı bulunmadığı ve gerçek gizli anahtar okunmadığı için reddedildi. Davranış sentetik 401, büyüyen cue, tamamlanan cue, yeniden deneme sayacı, tam paket ve Electron köprü testleriyle doğrulandı.
