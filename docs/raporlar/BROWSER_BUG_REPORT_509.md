# Rapor509 — İkinci motor arızasında üretilmiş sesi kurtarma

2026-10-21. Başlangıç HEAD:`0c81a37100c12f7ba4a5a5f0860951f1b883bb5b`; önceki ürün kodu:`76d64560834b10157faf0aefebf5eaa446b14b41`. Mevcut dal:`codex/broad-bugs499`, PR471. Başlangıç temiz. Bitiş ürün kodu:`5be0f88033d54a7b88eafa01ca4b2360adeb5088`. Ana master ve dış motor paketleri değiştirilmedi.

## Doğrulanan açıklar ve düzeltmeler

1. Önceki motor yeniden başlatması da takılırsa tamamlanan cache korunuyor fakat nihai WAV yazılmadan iş hata veriyordu. `dub_resume.recover_completed` ile en az bir geçerli gerçek parça varsa kurtarılan sesler zaman çizelgesine aktarılıyor. Eksik gruplar yalnız iş raporu klasörüne tek sessiz frame ile ayrılıyor, `failed` ve `engine_unavailable` olarak kaydediliyor; cache'e başarı olarak konmuyor. Zaman çizelgesi ilgili pencereyi dolduruyor, eksik bölüm sessiz kalıyor. Hiç gerçek ses yoksa veya parça örnek hızları uyumsuzsa sahte başarı üretilmiyor.
2. Başarısız forced regeneration'da eski gerçek ses korunursa onun metniyle `review/regenerationFailed` saklanıyor. Yeni metin eski sesin dökümüymüş gibi yazılmıyor.
3. Başlangıç hazırlığı da sınırlı çağrı üzerinden `EngineStalled` üretir; bir yeniden başlatma hakkını ve gerekirse kısmi kurtarmayı kullanır. Batch1'de OOM/CUDA kurtarması tükenirse de mevcut gerçek parçalar kurtarılabilir. İlgisiz hatalar yutulmaz, kullanıcı iptali kısmi başarıya çevrilmez.
4. Motor kapanışı sırasında dış cancellation olduğunda yalnız sunucunun sahip olduğu worker'lar kapatılır; cancellation tekrar yükseltilir. Böylece iptal başarı diye sunulmaz ve genel Python süreçlerine dokunulmaz.
5. Main IPC için kısmi kurtarma TR/EN uyarısı eklendi. Var olan kalite paneli failed/review grupları işaretler, bu çıktıyı otomatik videoya bağlamaz. Layout değiştirilmedi; mevcut kontrol kullanıcıdan inceleme ister.

Cache protokolü, model/CFG/temperature/referans veya kalıcı kullanıcı ayarları değiştirilmedi. Yeni bağımlılık kurulmadı. Kısmi ses, eksiksiz ses başarısı anlamına gelmez; amaç hata gizlemek değil üretilmiş konuşmayı kullanılabilir tutmaktır.

## Hedefli kontroller

- `backend/test_dub_resume.py`:3geçti; iki takılmadan sonra kısmi zaman çizelgesi, ilk dosyanın değişmemesi, missing parçanın cache'e girmemesi, tamamı eksikse ret, cancellation'da kurtarmama ve forced regeneration'da eski metin.
- `backend/test_dub_lifecycle.py`:4geçti; kapanış cancellation'ında yalnız sahip olunan worker ve iptal sözleşmesi dahil.
- `tests/test_dub_generation_quality.py`:11, `tests/test_dub_timing.py`:12 geçti.
- Node dub-service, değişen JS syntax,5değişen Python py_compile ve diff kontrolü geçti.

## Gerçek Windows/GPU ve nihai çıktı denemesi

Kullanıcının mevcut yerel referansıyla sentetik Türkçe tek cümle, gerçek nano-vLLM/VoxCPM2 üzerinden üretildi. Model15adım,concurrency1,request-timeout30sn,ready-timeout60sn,detailed yerel ASR,video timing,maxSpeed1,no-norm. Gerçek pipeline çalıştı; motor yükleme11.45sn,referans2.14sn,üretim+doğrulama15.08sn,1deneme/0tekrar. ASR similarity1.0,passed; nihai7sn/48kHz WAV,quality ve sync dosyaları yazıldı. Bu sesin insan doğallığı ölçülmedi.

Sonra aynı gerçek cache parçasına ikinci cümle eklendi ve iki worker takılması kontrollü olarak enjekte edildi. Tam `main()` zinciri12sn/48kHz kısmi WAV+quality+sync üretti. Durumlar ready/failed; ilk5sn önceki gerçek sesle örnek düzeyinde aynı,6sn sonrası sessiz. Senkron haritası renderer'ın gerçek validate fonksiyonundan geçti. Bu ikinci deneme gerçek GPU arızası değildir; gerçek ilk ses+kontrollü arıza+gerçek çıktı yazma doğrulamasıdır.

Yerel kanıtlar `tmp/report509/` altında; GPU/partial runner,log,WAV veJSON. Gerçek referans ve ham günlükler Git'e eklenmedi. Üretim motorunun `OUTPUT_ROOT` değişkeni yalnız deney sürecinde tmp/report509/output'a yönlendirildi; dış motor klasörüne çıktı yazılmadı. Dış motor kaynak/paket dosyaları değiştirilmedi.

## Sınırlar

Uzun61gruplu gerçek kullanıcı işinin tekrar koşumu, gerçek GPU çökmesi, start.bat/YouTube/Electron UI ve tam npm paketi yapılmadı. Kısa gerçek GPU üretimi bunların yerine geçmez. CI açık kalır; sonucu beklemedik/yeşil iddiası yok. Değişiklikler PR dalında, ana master'a merge edilmedi. Genel donanım/disk/model hataları tamamen ortadan kalktı denmiyor.
