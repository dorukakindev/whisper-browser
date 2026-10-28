# Rapor 729 — Okuyucu ses/vurgu sürümü

## Doğrulanmış davranışlar

R728 onay yolunu onardı; bu paket ayrı bir tüketici olan `book-listen` yolunu doğrular. İki repro önce kırmızıydı:

- İçeriği dışarıdan değiştirilmiş bölüm WAV'ı eski konuşma grupları ve metin vurgusuyla açılabiliyordu.
- Eski inceleme satırının dinle isteği, bölüm yeniden üretildiğinde yeni WAV'ı eski grubun zaman aralığıyla alabiliyordu.

Bunlar R728 manuel onay hatasının yeniden sayımı değildir: bozuk/eski medya okuyucuya verilmesi ve yanlış zamanla oynatılması ayrı kullanım yoludur.

## Onarım ve dosyalar

`src/media-workflows.js` dinle isteğindeki beklenen çıktı/metin kimliğini mevcut bölümle eşleştirir. İçerik adresli bölüm dosyasının gerçek SHA256'sı adındaki kimlikle eşleşmezse medya erişimi verilmez. Hash, Node akışıyla 1 MiB okuma parçaları kullanılarak asenkron hesaplanır; uzun bölümün tamamı belleğe alınmaz ve senkron disk döngüsü eklenmez. Asenkron okuma sırasında bölüm değişebileceğinden hash sonrasında bölüm yeniden okunur; eski sürüm döndürülmez. İçerik adresi olmayan eski kayıtların mevcut davranışı korunur; bu eski kayıtların bütünlüğü doğrulandı iddiası yok.

`src/renderer/media-workflows-ui.js` inceleme grubu dinle ve sesli okuyucuyu açma isteklerine beklenen çıktı/textHash alanlarını ekler. Yer imi ve mevcut pencere/proje sahipliği denetimleri korunur. Yeni CSS/düzen yok.

`tests/book-listen-revision729.test.js`: iki kırmızı repro ve hash sürerken yeni üretimin tamamlanması. Kontrollü akış kapısı yalnız bu son yarışın zamanlamasını belirler; gerçek servis ve capture yolu çalışır.

`tests/electron-book-quality636.smoke.js`: gerçek Windows inceleme ekranında kendi sentetik WAV'ının son örneği geçici değiştirilir. Gerçek fareyle dinle düğmesi hata gösterir, audio src bağlanmaz. Eski outputId reddedilir; dosya finally içinde eski haline konduktan sonra geçerli ses açılır. Kişisel ses/profil kullanılmaz.

## Kanıt ve tekrar

10 kısa Node testi, syntax/diff ve native Windows kabulü geçti. Native son koşum exit 0; önceki onay/diske kayıt/odak/sayfalama ve eksik kalitede M4B kapısı da geçer. Mevcut 11 before-quit listener uyarısı açıktır. Bu pakette grafik değişmediği için yeni görünüm başarısı iddiası yok; R727 görüntüleri tarihsel kanıttır.

```powershell
node --test --test-isolation=none tests/book-listen-revision729.test.js tests/book-review-revision728.test.js tests/book-reliability.test.js tests/book-quality-scope636.test.js
node --check src/media-workflows.js
node --check src/renderer/media-workflows-ui.js
& 'D:\Whisper Local\node_modules\electron\dist\electron.exe' tests/electron-book-quality636.smoke.js
```

## Kaynak ve sınırlar

Mevcut içerik adresli kayıt, onay ve M4B bütünlük sözleşmesi esas alındı. Node'un [asenkron okunabilir akış dokümantasyonu](https://nodejs.org/api/stream.html#consuming-readable-streams-with-async-iterators) incelendi; dış kod veya bağımlılık alınmadı. Akış API'si çalışan Node/Electron ile test edildi; sürüm yükseltmesi yok.

R728 gerçek GPU kabulü henüz çalışmadı: GPU boşluğu yeniden yaklaşık 7,6 GB gözlendi, başka sürece dokunulmadı. Yeni gerçek TTS/insan dinlemesi/YouTube/DRM/uzun kitap performans ölçümü/tüm DPI/BAT başlangıcı/tam paket/CI sonucu yok. Asenkron okuma bir performans iyileştirmesidir, uzun kitap benchmark sonucu değildir. 90 hedef aktif; müzik kapsam dışı.
