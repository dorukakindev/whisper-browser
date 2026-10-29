# Rapor755 — Whisper kapanışında gerçek süreç kapandığını bekleme

## Kanıtlanan hata
main.js before-quit aktif transkripsiyonda activeJobCancel() çağırıyor, ancak event.preventDefault yapmadan kapanışa devam ediyordu. Mevcut terminateProcessTreeAndWait doğru close beklese de uygulama bu Promise'i beklemiyordu. Dublaj servisinde bekleme vardı, Whisper yolunda yoktu. [Önceki üç kırmızı kontrol](evidence755/before.txt) bunu gösterir; eski stop638 testleri durdur düğmesini kapsıyordu, uygulama çıkışını değil.

## Uygulama
- src/main.js deferTranscriptionQuit: iş başlatma aşamasındaysa mevcut startSeq iptal edilir; henüz yetkilendirme bekleyen başlatma sonradan spawn edemez. Canlı çocuk varsa before-quit engellenir, tek bekleyen giriş ortak killActiveJob/close yolunu kullanır. Durduğu doğrulanıp activeJob boşalınca app.quit yeniden çağrılır. Başarısız veya thrown stop EN/TR açık uyarı verir, pencereyi kapatmaz ve tekrar denemeye izin verir. Mikro görev arasında değişen iş kimliğine eski kapanış uygulanmaz. İlgili cache flush ve diğer servis kapanışları korunur.
- tests/transcription-quit755.test.js: kapanmadan önce bekleme, ikiquit tekstop, başarısızstop, startupiptal, yeni işe dokunmama, thrownstop retry ve Türkçeuyarı5test; mevcut stop638 üçtest birlikte8PASS.
- tests/electron-transcription-quit755.smoke.js: ayrı Windows Electron profili/gerçek main/preload/IPC, model yerine test-owned Pythonana+torun süreç; iki before-quit olayında engelleme, tek resume, parentcloseöncesiresumeyok, ikiPIDdekapalı.

## Gerçek kanıt ve sınırlar
[Son Windows sonucu](evidence755/windows-quit.json):143ms,prevented2/resumed1,parentGone/grandchildGone/closedBeforeResume true,exit0. İlk aynınative152ms geçti; sonkimlikkorumasından sonra yeniden143ms doğrulandı. Test quit olayını gerçek handler'a elle yayar; son app.quit çağrısı testte kayıt altına alınır, gerçek işletim sistemi pencere kapama/menü tıklaması değildir. Süreç sonlandırması/taskkill/close gerçektir, model/GPU çalıştırılmaz. Bekleyen onay veya nativekillfailure unit-kontrollüdür, gerçek Windows yetki reddi yaratılmadı.

8Node/syntax/diffPASS. process-lifecycle sandbox'ta gerçekspawnEPERM verdi; parent runner yeşil görünse de başarı sayılmadı. Normal yetkide doğrudan node tests/process-lifecycle.test.js10PASS,gerçekhostparent/grandchild dahil. UI/CSS değişmedi, yeni görsel kalite iddiası yok. Kişisel uygulama kapatılmadı; test profili ayrıdır. start.bat/kurulum/GPU/API/Windowslogoutshutdown çalıştırılmadı. Mevcut11before-quit listener uyarısı sürüyor; sabit farklı servis kayıtları kendi başına leak kanıtı değil, setMaxListeners ile gizlenmedi. Diğer tüm ağır iş kapanışları bu paketle tamamlandı sayılmaz. Yeni bağımlılık/schema/IPC/kurulum yok; CI beklenmedi/kapatılmadı.

[Electron resmî app kaynağı/sözleşmesi](https://www.electronjs.org/docs/latest/api/app#event-before-quit) preventDefault ile uygulama çıkışının engellenmesini ve Windows oturumkapatma/yenidenbaşlatmada buolayın gelmeyebileceğini belirtir. Mevcut proje terminateProcessTreeAndWait ve dublaj kapanış yaklaşımı tekrar kullanıldı; harici kod kopyalanmadı. P047/P048 kısmi ilerleme;90aktifhedef devam.
