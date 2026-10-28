# Rapor717 — Native başlangıçta kapanış/iptal yarışı

Başlangıç: `31c95f75e06dfba05c3eb2f1aefb22e8aa5e8eb0`; ürün/test: `fbe02f2b1455c10bd946e54d1e57340d4fcd2609`; dal `codex/native-shutdown717`.

## Doğrulanan tek kök

`src/native-player.js` start yolu `authorizeMedia()` beklerken henüz session oluşmaz. IPC stop `startEpoch` artırıyordu; dışarı sunulan stop ve before-quit yalnız session temizleyen iç stop çağrısını yapıyordu. Onay geç döndüğünde eski epoch hâlâ geçerliydi; pencere ve mpv başlangıcına ilerleyebiliyordu. Başlangıç iptali için session varlığı yeterli değildir.

`requestStop()` dış iptal yollarında epoch artırıp mevcut session temizliğini kullanır. IPC stop, dış stop ve before-quit aynı sözleşmeye bağlandı. İç session değiştirme stop'u kendi yeni start epoch'unu iptal etmez. Kalıcı kapanış bayrağı eklenmedi: başka servis çıkışı engellerse yeni açık kullanıcı isteği çalışabilir.

## Kanıt

`node --test --test-isolation=none tests/native-player-lifecycle.test.js` öncesinde quit ve public-stop iki FAIL: geç onaydan sonra pencere kurucusuna1kez girildi. IPC stop ve yeni açık başlangıç kontrolü PASS. Sonrasında4/4PASS. Kontrollü VM Win32/fs/BrowserWindow sınırı; gerçek mpv oynatma veya gerçek dosya izin diyaloğu testi değildir.

`node --test --test-isolation=none tests/native-player-lifecycle.test.js tests/assistant-native-boundaries.test.js tests/process-lifecycle.test.js`: Node7subtestPASS, süreç dosyasının kendi10kontrolüPASS. Mevcut gerçek Windows parent/grandchild fixture'ı iki PID'nin kapanışını doğruladı. İlk sandbox denemesinde gerçek child spawn EPERM aldı; Node alt test özeti PASS görünse de çıktı hata içerdiği için başarılı kabul edilmedi. İzinli aynı komut tekrarında gerçek fixture PASS. Test eşiği/senaryo silinmedi.

`node --check src/native-player.js`, `git diff --check` PASS. Yeni bağımlılık, ayar, şema veya arayüz değişikliği yok. Tam npm test/uzunCI beklenmedi.

## İnceleme ve sınırlar

11 before-quit dinleyicisi ayrı servis kayıtları; mevcut uyarı tek başına bellek sızıntısı kanıtı değildir. Limit yükseltilmedi, uyarı susturulmadı; genel kapanış koordinasyonu çözülmüş sayılmadı. Metin stüdyosunun bağımsız pencere yaşamı incelendi ama kullanıcı açık stüdyosunu zorla kapatma davranışı eklenmedi.

Gece1000registry'de native-player/before-quit/terminateProcessTree kaynak adları bulunmadı; bu yalnız sözcük taraması, tüm tarihsel mekanizmaların yokluk kanıtı değildir. Genel süreç sonlandırma testi mevcut kontrol olarak tekrar kullanıldı; yeni bug diye sayılmadı. P047 kısmi ilerleme; gerçek GPU iptali/son parça timeout/OOM ve tüm kaynaklar bekler.

[Electron resmi before-quit sözleşmesi](https://www.electronjs.org/docs/latest/api/app#event-before-quit) incelendi: olay pencere kapanmadan önce gelir ve preventDefault çıkışı durdurabilir; Windows sistem kapanışında bu olay garanti değildir. Mevcut proje epoch yaklaşımı kullanıldı; dış repo kodu/dependency alınmadı. OS shutdown, actual mpv video/donanım, UI/DPI, start.bat/install.bat bu paketle doğrulanmadı. UI değişmediği için yeni ekran görüntüsü yok. DeepSeek gerektiren davranış olmadığı için canlı API çağrısı yapılmadı. Müzik analizi kapsam dışı korunur.
