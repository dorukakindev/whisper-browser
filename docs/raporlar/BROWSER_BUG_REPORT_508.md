# Rapor508 — Son ses grubunda takılma ve zaman aşımı

2026-10-21. Başlangıç HEAD:`e8453e95b14548c5d2b095d66549fe91d2f353d7`, önceki ürün kodu:`4276113b9cfac48cc2a82495845791775e2a0c86`. Dal:`codex/broad-bugs499`, mevcut PR471. Başlangıç temiz. Bitiş ürün kodu:`76d64560834b10157faf0aefebf5eaa446b14b41`. Ana kopya master'a veya dış motor paketine yazılmadı.

## Kullanıcı kaydındaki kanıt

Yerel dub-logs altındaki son iş özetleri yalnız hata/progress/süre alanlarıyla incelendi. Bir iş60/61,227.37sn,exit1,`asyncio.exceptions.CancelledError / TimeoutError` ile bitmiş. İki başka iş21/22'de82.70 ve122.09sn sonra kullanıcı iptaliyle bitmiş. Bu kayıtlarda ayrıntılı traceback yok. Ham günlük, medya/metin/referans veya kişisel dosyalar commit edilmedi. Referansın bozuk olduğu kanıtlanmadı.

## Doğrulanan kod yolu

Kurulu nano-vLLM sunucusunun async generate finally bloğu normal olmayan çıkışta `await submit('cancel',seq_id)` bekliyor. Bu RPC yanıtının kendi üst sınırı yok. Dış `asyncio.wait_for`, hedef iptalinin tamamlanmasını beklediğinden teoride180sn üretim zaman aşımı, iptal yanıtı gelmezse sınırsız sürebiliyor. Aynı işçinin sonraki istekte kullanılmasının toparlanma garantisi yok. Bu kod yolu kontrollü testte tekrarlandı; kullanıcının eski çalışmasındaki kesin GPU hata kökü olarak sunulmuyor.

## Düzeltme

- Yeni `dub_lifecycle.bounded_call`:işlem süresi dolunca iptal eder,3sn bekler; finally'deki cancel RPC hâlâ bekliyorsa ikinci iptal ve3sn son bekleme yapar. Geciken task exception'ı tüketilir. Normal dış iptal `CancelledError` olarak korunur.
- Sentez, kalite tekrarları, uzun metin kurtarma ve referans/prompt kodlama bu sınırlı çağrıyı kullanır. `EngineStalled` grup boşluk akışında yutulmaz; üst düzeye geçer.
- `generate_with_fallback`:takılan motor en fazla1kez yeni çalışanla yeniden kurulur. Paralellik yarıya iner, minimum1. Önceki gerçek önbellek yolları geri alınır; aynı referansla yalnız eksik/özellikle yeniden istenen parçalar üretilir. Sonraki takılma yeniden sonsuz döngü başlatmaz; tamamlanan cache dosyaları sonraki deneme için kalır.
- `stop_server`:kapanış15sn ile sınırlı; gerektiğinde yalnız bu sunucuya ait worker Process nesnelerini terminate/kill+zaman sınırlı join ile kapatır. Bütün Python/GPU süreçlerine yönelik bir komut yok.
- Main IPC, motor yeniden başlatma ve kapanış uyarısını kullanıcıya aktarır; mevcut yerelleştirmede TR/EN karşılıkları var. Layout değişmedi.

Referansı değiştirme veya cache'i silme işlemi yapılmaz. Ses cache protokolü değiştirilmedi; mevcut sesleri yeniden üretme zorunluluğu eklenmedi. Önceden yarıda kalan cache'in yeni sürümle kullanılabilmesi, önceki model/ayar/text kimliğinin aynı olmasına bağlıdır. Son grupta pahalı doğrulama/yeniden üretim yine süre alabilir; amaç normal hesaplamayı başarı diye göstermek veya timeout'u sadece artırmak değildir.

## Kısa kontroller

- `backend/test_dub_lifecycle.py`:3 geçti. Cancel RPC'nin hiç yanıt vermemesi sınırlı çıkıyor; task kalmıyor. Batch1'de bile bir kere yeniden başlatma, yollar/referansın korunması, iki denemeden sonra durma ve normal stop doğrulandı.
- `tests/test_dub_generation_quality.py`:11 geçti. Üretim uret fonksiyonunda son istek finally içinde takılıyor; ilk tamamlanmış WAV korunuyor, sunucu kapanıyor. Yeni sunucu aynı referansla yalnız eksik isteği üretiyor. Mock/fixture testi; gerçek GPU arızası enjekte edilmedi.
- `tests/test_dub_timing.py`:12 ve `backend/test_dub_recovery.py`:4 geçti.
- `node tests/dub-service.test.js`, değişen2JS syntax, değişen7Python py_compile, diff kontrolü geçti.

Windows yerel backend Python kullanıldı. Yeni bağımlılık yok; install/start.bat veya CUDA paketleri değişmedi. Gerçek YouTube/start.bat/Electron yeniden başlatma, GPU arıza enjeksiyonu, insan ses dinleme ve tam npm paketi bu tur yapılmadı. CI açık kalır, sonucu beklenmez/yeşil denmez. Değişiklikler mevcut PR dalındadır; kullanıcının ana master kopyasında henüz yoktur.
