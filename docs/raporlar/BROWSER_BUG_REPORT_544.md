# Rapor544 — Gerçek Windows dublaj kabul turu ve iki onarım

2026-10-25. Depo: https://github.com/dorukakindev/whisper-browser. Dal: codex/dub-runtime543, PR483. Başlangıç: c713e75231476447abd0d5b3db7edd7474cc7cc4. Bitiş kod/test commit: c2efcb83602bdcf61e751344590abdf34f71309a. Asıl ürün onarımı: a335345b3c70cdaec956ac9713a59f678927ac9f. Kullanıcı dört kabul denemesi ve sonrasında ana sürüme alma önerisine “yap” dedi; önceki otomatik merge etmeme kuralının bu teslim için doğrudan kullanıcı onayı vardır.

## Doğrulanmış onarımlar

1. GPU devir sahipliği: releaseIdle gerçek worker kapanışını beklerken dub:start yeni işin girdisini yazabiliyordu. `releasingEngine` artık yeni iş, referans değişimi ve TXT stüdyosu geçişini kilitler; tekrar release de reddedilir. `tests/dub-handoff.test.js` düzeltmeden önce yeni girdinin yazıldığını göstererek kırmızı, sonra yeşil oldu. Önce tamamlanan gerçek GPU denemesi sıralı devri, hedefli regresyon eşzamanlı devri doğrular.
2. A/B aracı Windows Unicode yollarında libsndfile Path açılışında hata verdi. Python binary stream ile okuma Çıktı/Örnek konuşma.wav yolunu düzeltti. `tests/test_compare_dub_audio.py` bunun regresyonudur. Gerçek WAV karşılaştırması tekrar geçti.

`src/dub-service.js` devir kilidi; `tools/compare-dub-audio.py` Unicode okuma; iki yeni test ilgili davranışı doğrular. `report460-regressions` ve `report491-audio` eski subprocess fixture'ları stdin desteklemiyordu: tek-seferlik motoru açıkça seçer; kalıcı motor ayrı worker testiyle sınanır. `test_report494_audio.py` AST kapsamına yeni kullanılan time bağımlılığı eklendi. `settings-ui-persist-roundtrip` keepEngine ve TMDB'nin ayrı kalıcılık depolarını sınıflandırır. Worker idle testi mock clock kullanır; uyku süresi tahmini kaldırıldı. Test silinmedi/eşik yükseltilmedi.

## Gerçek kabul denemeleri

İzole profil, sentetik referans/metin; gerçek Electron main/preload, dubService, nano-vLLM/VoxCPM2, RTX4070 SUPER. Aynı referans ve iki cue, 15 adım, akıcı gruplama, ayrıntılı ASR, zorunlu yeni üretim:

| Tekrar | Uçtan uca s | Model yükleme s | Referans s | Sentez s | Doğrulama s |
|---|---:|---:|---:|---:|---:|
|1|39.060|11.234|2.000|15.344|6.844|
|2|17.397|0|0|13.656|3.281|
|3|18.362|0|0|14.500|3.391|

Üçü done/ready/passed. Küçük kontrollü örnek, genel performans garantisi değildir. Sekiz gruplu uzun iş ilk hazır grupta iptal edildi. Anahtar1 korunarak yeniden başlatıldı: cached_groups=1, generated_groups=7, attempts=7; done. Bu iptal denemesi hızlı akustik doğrulama kullandı, ASR başarısı diye sayılmaz.

Ardından gerçek Whisper small/CUDA/float16 tamamlandı: workerExitBeforeSpawn=true; GPU belleği 11622MiB'den Whisper sonrasında911MiB'ye indi (ilk durum791MiB). Bu kullanım başka GPU süreçlerini/uygulamaları öldürmedi. Yeni üçüncü WAV native Electron'da decode/play/pause/seek/orijinal mute-rate geri yükleme kontrolünden geçti.

Satır2grup ile akıcı1grup aynı referans/metin için karşılaştırıldı. Satır varyantı doğrulanmış cache kullanır, yeni GPU üretimi diye sayılmaz; normalizasyon aynı mevcut servis yolundadır. İkisi11s ve passed/ready. Enerji tabanlı sessizlik oranları .658 ve .649; insan doğallığı kanıtı değildir. Varsayılan akıcı korunur; kör dinleme/duygu puanı verilmedi.

## Yerel kanıtlar (ignore, Git'e konmadı)

- `.uiprev/dub544-acceptance-1792885455423/results.json`: üç üretim, iptal/devam, Whisper ve olaylar. `tmp/dub544-acceptance.cjs` yeniden koşum harness'i.
- Aynı klasörün `comparison/listen.html` ve comparison.json: iki gerçek WAV için A/B.
- `.uiprev/dub544-lines-1792885719707/`: satır servis çıktısı.
- `.uiprev/dub-pipeline-playback/1792885734333-25032/`: gerçek WAV native oynatma.
- `tmp/ci483-windows.log`, `tmp/ci483-ubuntu.log`: eski c713e752 CI sonuçları.

## Hedefli testler ve bilinen CI sınırı

Worker2 + devir1, servis regresyonu, report4603, report4917, persist5, report4946, Unicode1 geçti. JS syntax/Python compile/diff kontrolleri geçti. Gerçek GPU/native testler yukarıda; tam npm test tekrarlanmadı.

Önceki PR483 CI run40142830530 Windows/Ubuntu başarısız. Bu turla ilişkili worker fixture/time/persist sorunları yukarıdaki hedefli koşularla düzeltildi. Worker'ın yeni gerçek uyku kullanımı da kaldırıldı; ratchet hala26>21: master8f141246 üzerinde ayrıca aynı26>21 hatası doğrulandı. browser-translation-merged da master üzerinde partial/complete beklentisiyle aynı şekilde kırmızı. Diğer görünür hatalar: coverage map, CSP/connect-src, sabit renk envanteri, privileged scheme, innerHTML izin envanteri, EN etiketleri, assistant-overlay sender kontrolü, watch preferences/window fixture'ı, renderer realm ve script sırası. Bunların tamamı bu turda araştırılıp kapatılmadı; yalnız önceki diye otomatik aklanmaz. Yeni CI açık kalır, beklenmez ve başarılı denmez. Ayrı bakım kapsamıdır.

Yeni bağımlılık, model, lock, install.bat/start.bat değişikliği yok. Windows normal start.bat açılışı bu turda yeniden çalıştırılmadı; gerçek Electron GPU alt yolları doğrulandı. Uzun gerçek YouTube, DRM, tüm donanımlar, kişisel referans/duygu kalitesi ve sıfır hata garantisi yok. Ham ses/profil/API anahtarı Git dışı. Ana kopyanın önceden kirli üç belgesi ve untracked kullanıcı dosyaları korunarak teslim yapılır; merge kesin kimliği ayrı notta yazılacak.
