# Rapor469 — Uyarlanabilir dublajda erken hız sınırı hatası

2026-10-18. Kullanıcının yeni bug bulup düzeltme isteği kapsamında ses
oynatma ve referans akışları incelendi. Kesin yeni bulgu bir tanedir.

## 469-01 / Orta — Asenkron yavaşlama tamamlanmadan dublaj iptali

Konum: `src/renderer/browser-dub-audio.js`, `tick()` sync dalı.
Kod mevcut video hızı × uzatma katsayısı > 16 olduğunda oturumu
sonlandırıyordu. Bu sırada hedef video hızı henüz uygulanmamış olabilir.
Oynatılabilir bir bölüm, eski hız yüzünden imkânsız sanılıyordu.

Somut repro: 1 saniye video / 20 saniye ses haritasında başlangıç hızı
1×. Mevcut çarpım 20 olsa da hedef video hızı 0.0625× olduğunda ses
hızı 1.25× olur ve oynatılabilir. Eski kod yeni regresyonda session=null
ile başarısız oldu. İkinci gerçekçi varyant: kullanıcı 4× izlerken 5
kat uzatılan bölüm; hedef video 0.8×, ses 4× olmalıdır.

Düzeltme: imkânsızlık hedef hızla hesaplanır. Video hızı IPC sonucu
beklenirken mevcut çarpım sınırı aşıyorsa ses kanalları duraklatılır;
oturum korunur. Yeni hız gözlendiğinde normal senkron oynatma devam eder.
Minimum video hızında dahi 16× ses sınırını aşan harita yine reddedilir.

## Kanıt ve sınırlar

`tests/report469-regressions.test.js`: browser 20 kat uzatma/gecikmiş
hız yanıtı, player 4× + beş kat uzatma, gerçekten imkânsız 300 kat
uzatma için üç test. İlk test eski kodda kırmızı, düzeltilmiş kodda üçü
yeşil. Hedefli toplam 12 Node test dosyası geçti (devir notunda listeli).
`node --check src/renderer/browser-dub-audio.js` ve `git diff --check` geçti.

Gerçek model/GPU, ses donanımı, YouTube, normal start.bat arayüzü ve uzak
Windows CI çalıştırılmadı. Asenkron hız yanıtları kontrollü fixture'dır;
canlı sitenin hız değişimini kabul edeceğini kanıtlamaz. Referans
akışlarında bu tur kesin yeni bulgu üretilmedi; testleri geçti.
