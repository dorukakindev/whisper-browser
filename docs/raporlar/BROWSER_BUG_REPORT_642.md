# Rapor 642 — Kapanmamış ses motorunun sahipliği

Başlangıç `1b41451daaa4be1634965bb5b8edfa65f3f7400a`. İki bağlantılı hata aynı kapanış güvenilirliği sorununun farklı katmanlarıdır; test sayısı bug sayısı değildir.

## Doğrulanan hata

`dub_lifecycle.stop_server`, başarısız stop RPC'sinden sonra terminate/join/kill/join uyguluyor ancak son `is_alive` sonucuna bakmadan dönebiliyordu. Kontrollü süreç fixture'ı kill sonrası hâlâ canlıyken eski kod EngineStalled vermedi. Artık son kontrol başarısızsa durduruldu sayılmaz; özgün iptal türleri korunur.

`EngineSession.reset` motor kaydını stop'tan önce siliyordu. Örneğin process.kill PermissionError verince sonraki reset artık o motoru bulamıyordu. Gerçek EngineSession testi eski kodda `session.server is None` ile kırmızıydı. Artık başarısız kapanış exact server nesnesini korur; key/reference/loaded geçersiz kalır. Tekrar acquire önce aynı kapanışı dener, doğrulanmadan yeni GPU factory çağrılmaz. Daha sonra kapanış onaylanırsa kayıt temizlenir.

## Kanıt / sınırlar

- Yeni `test_dub_shutdown642.py`: 2/2; aynı testler ordinary stop failure, iptal türü, canlı kalan süreç, process kill reddi, tekrar reset ve yeni factory engelini denetler. Gerçek GPU veya işletim sistemine kill uygulanmaz.
- Mevcut `test_dub_runtime.py`4/4, `test_dub_worker_protocol.py`5/5, `test_dub_generation_quality.py`20/20 geçti. Her komutun exit kodu ayrı kaydedildi. Son iptal-türü dalı değişiminden sonra yeni2/2 yeniden geçti.
- Python compile ve diff temiz. UI, yeni bağımlılık, kalıcı şema veya start.bat değişmedi. Native Windows/GPU kapanışı, model sesi ve canlı YouTube doğrulaması yapılmadı. Kontrollü fallback testi gerçek donanım kararlılığı garantisi değildir. Uzun CI beklenmez.

Motor kapasitesinin büyümek için yeniden yüklenmemesi mevcut bilinçli davranıştır; yeni hata diye değiştirilmedi. Referans önbelleği waveform+prompt kimliği kullanır; bu yolun mevcut regresyonu geçti, yeni kalite iddiası yok.
