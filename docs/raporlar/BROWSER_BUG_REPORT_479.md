# BROWSER_BUG_REPORT_479 — Oynatma, medya yaşam döngüsü ve katalog

Tarih: 2026-10-19. Mevcut dal/PR: `codex/browser-audit477`, PR454.
Başlangıç HEAD: `cff4e0a8707e7c1d5c8d434dd929bc99a2f17015`.
Başlangıç ürün kodu: `cb7a4c05255860c4f68bd8ed08d28a7925726644`.
Bitiş ürün kodu: `e21de8ac7bb16210ca4eddbf18c6e2754e7f0b30`.
Fetch sonrası master hâlâ `68775abbfdacff72ee48095e9ee8cb74009bff49`.

Önceki 477/478 maddeleri tekrar sayılmadan 10 farklı tetikleyici doğrulandı.
Yeni regresyon dosyası ürün kodu değişmeden 10 FAIL, düzeltmelerden sonra
10 PASS verdi. Gerçek kullanıcı profili veya canlı sağlayıcı kullanılmadı.

| No | Önem | Tetikleyici, kök neden ve düzeltme |
|---|---|---|
| 479-01 | Orta | Eski movie.mp4 100 bayt, aday aynı adla 999 bayt: basename/stem/ext toplamı 5 puan verip unique seçiyordu. Açık boyut çelişkisi varken unique öneri yapılmıyor; aday kullanıcı değerlendirmesi için ambiguous listesinde kalıyor. Bu, daha önce düzeltilen mükerrer gruplama değil, yeniden bağlama skorlayıcısıdır. |
| 479-02 | Orta | Birleştirilen kayıtlarda aynı session id'nin eski 10 saniyelik snapshot'ı yeni 120 saniyelik veriyi eziyor, totalWatchSeconds düşüyordu. Aynı oturumun watchSeconds/endedAt değerleri maksimum, başlangıcı en erken, endPosition son bitişe ait olacak şekilde birleştiriliyor. Hedef medya kimliği korunuyor. |
| 479-03 | Orta | browser-media-tools run() içinde stdin.end senkron fırlatınca Promise reddedilse de çocuk ve watchdog temizlenmiyordu. Yazma try/catch'i kill+finish yoluna giriyor. Önceki 472 yalnız bu modüldeki asenkron stdin error olayını kapsıyordu; burada farklı senkron hata yolu doğrulandı. |
| 479-04 | Orta | DownloadItem son done olayında native getter 'Object has been destroyed' fırlatırsa done yarıda kalıyor; live/scheduler yuvası serbest bırakılmıyordu. Native metadata getter'ları son sağlam değere dönüyor; terminal temizlik ve kaynak iadesi sürüyor. Getter hatası fixture ile enjekte edildi; gerçek kullanıcı indirmesi kesilmedi. |
| 479-05 | Orta | İki örtüşen cue aynı id taşıdığında devam eden ikinci replik kendi id'si eşit diye görülmüyor, autoPause veya loop-cue konuşma ortasında devreye giriyordu. Örtüşme kontrolü ID yerine farklı cue nesnesiyle yapılıyor. |
| 479-06 | Düşük | Katalog sezon null → 0, bölüm true → 1 dönüştürülerek eksik/bozuk bölüm verisi geçerli sanılıyordu. Yalnız sayı veya boş olmayan sayısal dizge kabul ediliyor; açık sezon 0 ve '0' geçerli kalıyor. |
| 479-07 | Orta | Afiş seçici açıkken kayıt silinirse seçimden sonra PNG yazılıyor, hemen sonraki found(id) hata veriyordu; cleanup try bloğuna girilmediğinden sahipsiz PNG kalıyordu. Kayıt seçiciden sonra, dosya yazılmadan önce yeniden doğrulanıyor. |
| 479-08 | Düşük | Katalog store.upsert lookup ham ID ile, itemOf trim/slice ile çalışıyordu. 'movie' sonrasında ' movie ' upsert aynı kanonik ID'yle ikinci kayıt yaratabiliyordu. Lookup ile saklama aynı 120 karakter trim sözleşmesini kullanıyor. Bu store API sınır durumudur; normal UI'da her kaydetmede yaşandığı iddia edilmiyor. |
| 479-09 | Düşük | Yavaş model uyarısından sonra rtf:null, Number(null)=0 nedeniyle sahte 'hız düzeldi' bildirimi üretiyordu. Null/boş/boolean ölçümler sayısal kanıt sayılmıyor; geçerli ölçüm gelene kadar warned durumu korunuyor. |
| 479-10 | Orta | browser-video-analysis run() stdin error'larını boş listener ile yutuyordu; OCR/intro giriş borusu kırılırsa süreç kapanana kadar sonuç bekliyordu. Hata anında kill+finish ile reddediliyor, timer/listener temizleniyor. Bu, 472'deki browser-media-tools modülünden ayrı OCR/intro yürütme yoludur. Senkron end hatası da aynı temizlik yoluna bağlandı. |

## Hedefli doğrulamalar

- `node tests/report479-regressions.test.js`: 10/10 geçti (önce 0/10).
- media-relink-matcher: 9; media-relink: 8; browser-downloads: geçti.
- media-catalog-store ve media-catalog-service: geçti.
- report472-regressions: 2; browser-live-asr-pipeline: 8 geçti.
- security-media-learning: 18; player-ui: 153 geçti.
- Değişen 8 ürün JS'i ve yeni test: node --check geçti.
- git diff --check ve teslim belge indeks kontrolü.

Komutlar `node tests/<ad>.test.js` olarak doğrudan terminalden çalıştı.
Testler kısa kontrollü fixture/static sözleşme kontrolleridir; özellikle
player-ui testinin geçmesi gerçek Electron görüntüsüyle eşdeğer değildir.
Tam npm test/uzun CI bekleme yapılmadı. start.bat, gerçek Electron/DPI,
YouTube/indirme, GPU/CUDA/model, gerçek OCR/intro ve ses donanımı denenmedi.
CSS, görünüm, bağımlılık, şema ve kurulum değişikliği yok. Kullanıcı profili,
kişisel dosyalar ve çalışan uygulama korunuyor. Yeni PR yerine mevcut
PR454'te üç turun kodu birlikte incelemeye açık tutuluyor; merge yapılmıyor.
