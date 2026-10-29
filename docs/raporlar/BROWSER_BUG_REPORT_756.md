# Rapor756 — Aynı videonun yeni oturumuna eski dublaj hazırlığını taşımama

## Gerçek kök ve kapsam
R682/683 farklı video kimliğini, R686 önceki hazır sesin korunmasını zaten kapsıyordu. Yeniden yeni bug sayılmadı. Eksik alan: aynı mode/tab/mediaId ile video yeniden açılıp generation değişince bekleyen seçici, plan veya latest sorgusu hâlâ kabul ediliyordu. Ayrıca plan/shorten hata catch'i güncel kaynak doğrulamadan eski hata metnini yazıyordu. [Üç önce-kırmızı repro](evidence756/before.txt): old.srt seçildi, Old plan failure yeni ayrıntıyı ezdi, eskiWAV/aralık yüklendi.

## Düzeltme
src/renderer/dub-generator-ui.js mevcut kalıcı mediaIdentity yanına requestIdentity ekler; geçici işlem kimliğinde generation da vardır. open/configsonrası/latestsonrası,prepareCurrent,yerelSRT/background/delivery seçimi,plan ve kısaltma istekleri bu snapshot'ı kontrol eder. Bayat hata da güncel durum/ayrıntıya yazılmaz. Kalıcı sourcehash/ready ses eşleşmesi değiştirilmedi: yeniden açılış sonrası yeni lookup aynı videonun kayıtlı sonucunu yine alabilir. Farklı videoya geçişte eski SRT/arka plan temizliği ve mevcut Video değişti uyarısı korunur. Yeni UI metni/CSS/ayar/schema/IPC yok.

Testler: tests/dub-request-owner756.test.js5yeni durum; eskioturumseçici,lateerror,lateoutput,latebaşarılıplanreddi ve yenioturumlookupbaşarısı. tests/electron-dub-owner756.smoke.js gerçek Windows renderer/preload/IPC+kontrollügeneration/IPCsonucu ile ilküçünü doğrular. [Nativekanıt](evidence756/windows-owner.json):exit0,oldPicker/oldPlanError/oldLookupRejected true. Gerçeksite navigasyonu/GPU/sesdecode çalıştırılmaz, kontrollü generation gerçekYouTubereload diye sunulmaz.

## Doğrulama ve açık sınırlar
5NodePASS, mevcut dub-generator-ui ve dub-source-restore-ui scriptleri doğrudan exit0. İlk birleşik Node runner eski scriptin geç asyncassertionhatasını yeşil başlıkla bastı; içerik görüldü ve başarı sayılmadı. Farklıvideotemizliği/uyarısı korunup doğrudanscriptsonundaPASS görüldü. Worker/handoff hedefli12kontrol normalyetkidePASS; sandboxspawnkontrolünün null!==0 hatası normalyetkidegeçti,ürünbugısayılmadı. Syntax/diffPASS,mevcut11listeneruyarısı sürer. P005/P006/P010/P079 kısmiilerleme,90aktifhedef sürer. Üretimçıktısının geri dönüp kasıtlı kullanımını engelleyen katıURLdeğişimi getirilmedi. Kısaltma dalları aynıguardkullanır; yeni nativecanlıLLMkısaltmakoşusu yok. Yeni tasarım yapılmadı,kişiseluygulama/sekme/ayarlar değişmedi. start.bat/GPU/API/fullCI çalıştırılmadı,CIkapatılmadı.

[WaveSurfer gerçek kaynak](https://github.com/katspaugh/wavesurfer.js/blob/main/src/wavesurfer.ts) supersededLoadScopes ile geç gelen eski yükleme hatasını güncel/gerçek hatadan ayırır. BSD3lisanslı yaklaşım incelendi; dışkod veya bağımlılık alınmadı, projedeki generation kullanıldı.
