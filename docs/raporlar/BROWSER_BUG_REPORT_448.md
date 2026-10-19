# BROWSER_BUG_REPORT_448 — Rapor447 kritik iddialarının bağımsız doğrulaması

Tarih: 2026-10-17. İncelenen HEAD: 5e89a65117e30a21f3f246cdfbfec16bbe8af07a.
Ürün kaynakları son kod46cfdfe24ec8175f6bff3b27195a4ffd890c902a ile aynı; c26e5e0e ve5e89a651 belge commit'leridir. Kullanıcı rapor447 özetinin gerçek olup olmadığını sordu. Bu çalışma düzeltme değil doğrulamadır.

## Sonuç

Raporda gerçek hatalar var; “51 somut/doğrulanmış hata” ve bütün HIGH dağılımı bağımsız doğrulama olarak kabul edilemez. Paylaşılan altı kritik iddia incelendi. Beşinin temel kod davranışı yeniden üretildi; preload'un mevcut kullanıcı akışını bozduğu ve process probe'un sonsuza dek kilitlendiği yorumları yanlış/geniş. Altıncı MessagePort backpressure iddiası bir mimari risk, gözlenmiş bellek sızıntısı olarak kanıtlanmadı. Kalan45 madde bu tur tek tek doğrulanmadı; topluca doğru veya yanlış sayılmadı.

## Doğrulama tablosu

| ID | Karar | Bağımsız kanıt / önemli sınır |
|---|---|---|
| CAT5-01 const ataması | Doğrulandı | Gerçek modül literalRanges('x\u0301','x') ile TypeError: Assignment to constant variable. Genel birleşik karakterlerin tümü değil, hızlı yolu koruyan x+acute gibi girdiler tetikler. Arama işlevi exception verir; bütün Electron/main sürecinin çökmesi ayrıca kanıtlanmadı. |
| CAT1-01 attach yarışı | Doğrulandı | Gerçek BrowserDubAudio sınıfında aynı tick iki attach çağrısı; izlenen interval sayısı2, remove sonrası1. Timerlar testte sentetik sayıldı, gerçek sızıntı bırakılmadı. Mute'un bütün yan etkileri ayrıca ölçülmedi. |
| CAT3-01 token ceiling | Doğrulandı | AdaptivePlanner(token_budget=10,base_chunk=20,min_chunk=1,max_chunk=40), record('truncated',est_tokens=100) -> learned80; üç6 tokenlık grup18 maliyetle birlikte paketleniyor. Başlangıç bütçesi aşılabiliyor. Gerçek API/context_length_exceeded bu testte kullanılmadı. Budget0 sınırsız ve bölünemez tek grup sözleşmesi korunmadan önerilen min ifadesi körlemesine uygulanmamalı. |
| CAT2-01 ham IPC event | Temel davranış doğrulandı; işlev bozulması yorumu yanlış | Gerçek preload VM içinde Electron fixture ile çalıştırıldı. onYoutubeTvEvent callback arg0event, arg1payload. smarttube-tv.js:239 açıkça (_event,state) bekliyor; mevcut TV callback'ine veri yanlış gitmiyor. onYoutubeEvent için repo içinde tüketici bulunmadı. Gereksiz ham event aktarımı güvenlik/sözleşme borcudur; payload-only düzeltmede çağıran kod da beraber değişmeli. Electron contextBridge üzerinden istismar/Node erişimi kanıtlanmadı. |
| CAT2-10 stderr | Doğrulandı; sonsuz bekleme değil | Gerçek sentetik Node alt süreci1MiB stderr yazıp callback'te READY stdout veriyor. Mevcut probeCommand timeout1000 ile1003ms sonra null; kontrol spawn'ında stderr.resume() ile READY. Mevcut varsayılan8sn timeout zaten vardır. Probe sonuç kaybı/gecikme gerçek; sonsuz deadlock anlatımı yanlış. |
| CAT4-04 backpressure | Kısmi mimari risk, bellek sızıntısı doğrulanmadı | Worklet samples sabit Int16Array(16000*8), flush'ta transferable ArrayBuffer gönderiyor; Float32Array tanımı yanlış. renderer.js:11474 pending>=8 reddeder; main.js:17600 chunkFiles>=8 reddeder. Bu sınırlar bloke renderer'ın henüz okuyamadığı MessagePort kuyruğunu sınırlamaz, ack/worklet limit eksikliği ayrı risktir. Gerçek artan heap/MessagePort backlog/uygulama sızıntısı ve “hızla” nitelemesi ölçülmedi. |

## İstatistik tutarsızlığı

Matris51 satır içeriyor; sayı tek başına51 kanıtlanmış bug değildir. Rapor özeti kategori1 için11HIGH+1olumlu, kategori2 için8HIGH+4MEDIUM, kategori3 için3HIGH+6MEDIUM diyor. Matrisin makineyle sayımı ise kategori1:12HIGH; kategori2:9HIGH+3MEDIUM; kategori3:4HIGH+5MEDIUM. Kategori4:3HIGH+5MEDIUM ve kategori5:5HIGH+5MEDIUM tutarlı. “Olumlu doğrulama” hata sayısına katılmamalı. HIGH etiketi kod incelenmesiyle otomatik doğrulanmış sayılmaz.

## Yöntem ve teslim sınırı

Kaynak/çağıranlar doğrudan incelendi; rapor içindeki kod önerileri çalıştırılmadı. Kendi kısa probe'larımız ignored tmp/audit448/check.js ve stderr.js içinde oluşturuldu. node check gerçek arama modülü, gerçek dublaj sınıfı ve gerçek preload kodunu fixture Electron ile çalıştırdı. Python gerçek AdaptivePlanner sınıfını içe aktardı. Stderr testi gerçek Node alt sürecinde1sn sınırlı sentetik veri kullandı. Ücretli sağlayıcı/API/gerçek anahtar/YouTube/GPU/profil/ses verisi kullanılmadı.

Ürün koduna hiçbir düzeltme uygulanmadı. Tam paket/Electron/start.bat/CUDA/donanım/heap profiler çalıştırılmadı. Belge indeks ve diff kontrolü teslimde yapılır. Rapor447 korunmuştur; burada yalnız altı kritik iddia ve istatistiği değerlendirildi.

Uzak dal salt okunur kontrol edildi: c26e5e0e6018d21f4d0554ddc02350f09abba82d. Yereldeki rapor447 commit'i5e89a651 henüz uzakta yok. Bu denetim raporu/devir belgeleri yerelde kaydedilir; inceleme dışı önceki raporu da yayımlamamak ve kullanıcının paylaştığı push durduruldu durumunu korumak için push yapılmaz. Yerel belge commit'i teslimin sonunda açıkça belirtilir.

Belge kontrolünde önceki447 raporunun INDEX girdisinin de eksik olduğu bulundu;447 ve448 girdileri eklendi. Ardından docs-index-integrity ve diff-check geçti.
