# Rapor762 — Native mpv durdurma ve kapanış doğrulaması

## İnceleme ve gerçek hata

Tekrarlanan11before-quit listener uyarısı incelendi: farklı servislerin ayrı kapanış kayıtlarıdır, tek callback'in tekrar eklenmesine dair kanıt yok. Bellek sızıntısı olarak sayılmadı, maxListeners yükseltilmedi; uyarı hâlâ açıktır. İnceleme native-player.js içinde ayrı gerçek kusur buldu: stop önce session=null yapıp yalnız proc.kill çağırıyordu; süreç close doğrulanmadan IPC ok:true ve uygulama quit devam ediyordu. Eski mpv canlıyken yeni başlangıç mümkün olabiliyordu. Bu R755Whisper kapanışıyla aynı ürün alanı değil; native mpv'nin kendi sahipliği onarıldı.

## Uygulama

- src/native-player.js: mevcut terminateProcessTreeAndWait yardımcısı kullanılır; stop pending/kapanmamış süreç sahipliği ayrı stopping kaydında kalır. Tek promise yinelenen durdurmayı birleştirir. Başarısız stop hata döndürür, eski süreç hâlâ owned/active/stopping durumunda tutulur ve sonraki açık stop yeniden dener. Yeni start awaitstop tamamlanmadan host/süreç açamaz. Daha önce gerçektenclose görülen süreç tekrar beklenmez. Beklenmeyen socket/process kapanışının asyncstop hatası unhandled rejection olmaz. before-quit başlangıçepochunu geçersiz kılar; aktif/closing mpv varsa preventDefault ve confirmedclose sonrası app.quit. Failure'da pencere kapanmaz. Threshold değişmez.
- tests/native-player-lifecycle.test.js: mevcut VM testinin yeni yerel yardımcısını doğru proje yolundan yükler; test davranışları/eşikleri korunur.
- tests/native-player-stop762.test.js: controlledclose öncesi stop bitmez/tekpromise/active+stopping, başarısızstopownedretry, çiftequittekstop, başarısızquitretry. VM yalnız testte session kurulumu yapar; üründe test oturumu API'si açılmadı.
- tests/electron-native-stop762.smoke.js: kurulu gerçek mpv.exe, gerçek host/nativehandle/pipe/loadfile, ayrı profil ve FFmpeg sentetik sessiz30snMP4. İlkIPCstop ve ikinci oturumda iki before-quitemit/sonquitgözlemcisi; ownedmpvclose olmadan bitişe izin vermez. Kullanıcının uygulaması kapatılmaz; testin yalnız kendi mpvleri hata halinde temizlenir.

## Kanıt

[GerçekWindowsmpv](evidence762/actual-mpv.json):iki ownedmpv; IPCstop118ms,quit102ms,prevented2,resumed1,closedBeforeQuittrue. Bunlar tek koşu süreleridir; genel süre garantisi değil. Son statusactiveguard eklemesi kontrollü testle doğrulandı; gerçek koşu aynı kapanış mantığında, ekstatusguard öncesidir. 13NodePASS (nativepending4+stop4+Whisperquit5), process-lifecycle doğrudan10PASS ve gerçek Windows parent/grandchild kapanışı. Syntax/diffPASS. İlk test kurulumunda ./process-lifecycle require yolu ve sentetik reposition eksikti; fixture düzeltildi, ürün hatası diye sayılmadı.

Native gerçek görüntü/oynatım kalitesi veyaGPUdecode kabulü değil: bu paket UI/CSS değiştirmedi ve sessizvideo kullanır. Torrent/DRM/gerçekkişiselfilm/OSlogout ve tamstart.bat kapanışı yok. Başarısız stop mainhandler'da EN/TR hata döndürür; quit başarısızlığında uygulama açık kalır, otomatikbaşarı iddiası yok. Mevcut11listeneruyarısı neden ayrımı yapıldı ama merkezikapanışmimarisi bu tur yeniden yazılmadı. Tamtest/uzunCI beklenmedi.

## Kaynak ve teslim

Node child_process close olayı ve Electron before-quit resmî yaşam döngüsü belgeleri incelendi; projedeki mevcut süreç ağacı yardımcısı tekrar kullanıldı. Dış kod/bağımlılık alınmadı; yeni IPC/ayar/schema yok. Başlangıç8bd738bda12fbfbf8e11a0918eb22a9e2daabcc7; ürün/testbitişif2b9ea5413ae92d5472ab11f3d0ab6b079a246e7. P047 süreçkapanışı native-mpv kapsamı ilerler; tüm90hedef tamamlanmadı,müzikyok. Normal kod/belgecommitleri,PR/master ve kişisel dosyaları koruyarak ana güncelleme uygulanır.
