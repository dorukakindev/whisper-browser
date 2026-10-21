# BROWSER_BUG_REPORT_489 — Arşiv, altyazı ve sekme kurtarmada 10 yeni hata

Repo:https://github.com/dorukakindev/whisper-browser
Dal:codex/broad-bugs489. PR:https://github.com/dorukakindev/whisper-browser/pull/461
Başlangıç özellik HEAD:f109a04e47fc47e4183a24a9a145274625ed187b.
Bitiş ürün/test kodu:4c26c4640539f930aceaef2772baa8c1e841ba58.
Rapor488'in ses oturumu/proje bulguları tekrar sayılmadı.

## On doğrulanmış bulgu

| No | Önceki hata ve etki | Düzeltme / regresyon |
|---|---|---|
| 489-01 | Arşivde aynıID+aynımetin doğrudan eşleşmesi tag/role'u kontrol etmiyordu. Button “Open” çevirisi düz metin “Open”a geri gelebiliyordu; fallback yolu ise bu bağlamı zaten kontrol ediyordu. | Hem doğrudan ID hem metin fallback'i aynı source/tag/role anahtarını kullanır. Button→paragraph örneği eski1 eşleşme, yeni0. |
| 489-02 | Güncel sayfada aynıID iki kez varsa Map sonuncuyu alıyor, fallback kuyruğu aynıID'yi yeniden kullanabiliyordu. Tek DOM kimliğine iki çeviri/yanlış blok bağlanıyordu. | Yinelenen güncel ID'ler eşleştirmeden çıkarılır; güvenilir tekiller devam eder. Eski2, yeni0 eşleşme. |
| 489-03 | İndeksin hedef dili kontrol edilirken okunan arşiv JSON payload'ının hedef dili kontrol edilmiyordu. Yanlış/bozulmuş indeks-dosya eşleşmesinde başka dil çeviri geri yükleniyordu. | Record targetLanguage de istenen dile eşit olmalı. TR indeks/DE payload eski kabul, yeni null. |
| 489-04 | JSON yolu sınırlandırılmışken findPage dönüşündeki displayPath arşiv dışına çıkabiliyordu. Bozulmuş indeks yanlış dosyayı gösterme/açma yolu üretebiliyordu. | Display path doğrudan Sayfalar klasöründe ve .md olmalı. ../outside.md eski dönüyor, yeni ret. Bu test yerel bozuk indeks sınırını doğrular; uzak exploit iddiası yok. |
| 489-05 | Subtitle output total/failed için Infinity veya “Infinity” sonsuz sayaç üretiyor, completed hesapları NaN olabiliyordu. | Negatif olmayan güvenli tamsayı sayacı; geçersiz girdiler0. Sonuçlarda nonfinite değer kalmaz. |
| 489-06 | completed:null veya boş dizgi Number ile0 sayılıyordu; total10 failed2 olduğunda0/10 ve10 başarısız gösteriyordu. | Null/eksik/boş completed bildirilmemiş sayılır, total-failed=8 hesaplanır. Explicit0 korunur. |
| 489-07 | Tek clone edilemeyen opsiyonel track/selection alanı tüm normalizeClosedBrowserTab'ı DataCloneError ile kesebiliyordu. | Optional obje güvenli clone edilir; bozuk alan atılır, geçerli track ve sekme URL'si korunur. Geçmişin bağımsız kopya sözleşmesi sürer. |
| 489-08 | Otomatik kalibrasyonda start:null/boş/boolean Number ile0 oluyordu; uzun tek cümle sahte0→10sn kaydırmayı kabul ediyordu. | Yalnız sonlu sayı veya boş olmayan sayısal dizgi eşleşme kanıtıdır. Null zaman örneği artık kabul edilmez. |
| 489-09 | Çok noktalı senkron regresyonunda n*sum(x²)-sum(x)² büyük kaynak başlangıcında hassasiyet kaybediyordu.100000sn+0/1,1/2,2 ve gerçek4sn offset eski3,78982137;1e9 başlangıçta tümden sıfır varyans hatası. | Ana fit ve leave-one-out fit başlangıca/ortalamaya göre merkezlenir. İki örnekte scale1/offset4, sıfır residual. Bu sınır örneğidir; her normal kısa videoda görülen hata diye sunulmaz. |
| 489-10 | Geçici altyazı cache'i bütün platformlarda yolu lowercase yapıyordu. POSIX /case/cache dosyası /case/Cache'e ait sayılıp limit budamasında silinebiliyordu. | pathKey Windows ayıracında case-insensitive, POSIX'te exact. Simüle POSIX fs testinde kardeş klasör dosyası index'e girmez ve unlink edilmez. Windows normal case davranışı sürer. |

## Kanıtlar

`tests/report489-regressions.test.js` on ayrı test içerir. Başlangıçf109a04e
kaynakları ignore tmp/report489/before altında bağımsız kopyada koşuldu:
**10 test,0pass,10fail**. Eksik require/syntax hatası değil, her test beklenen
hatalı davranıştan kırıldı. Aynı yeni testler son kodda **10/10 geçti**.
Ek100000sn sayısal hassasiyet probe'u eski/yeni offset'i doğrudan karşılaştırdı.

Hedefli mevcut testler:
- browser-subtitle-sync,subtitle-output-contract,browser-chapters geçti.
- browser-translation-archive,browser-cue-timeline-calibration,browser-experience,
  browser-subtitle-files geçti.
- ci-determinism-ratchet:random0/0,aux11/11,sleep21/21,wallclock13/13 geçti.
- npm run test:electron-bridge izole Windows profilinde geçti.
- Değişen6JS + main/preload/renderer node --check ve git diff --check geçti.

UI düzeni/etiketi değiştirilmedi; görsel test bu turda yapılmadı.
Tam yerel paket CI hatası üzerine çalıştırıldı: 18 dosya kırmızı; biri kalibrasyon regresyonu, kalanlar eksik Python/Node test bağımlılıklarıyla ilgili ortam engelleri. Son Windows CI sonucu aşağıdadır.
Test silme/eşik gevşetme, paket/model indirme veya kurulum değişikliği yok.
Gerçek YouTube/DRM/GPU/ücretli sağlayıcı ve kullanıcı profilinde start.bat akışı
çalıştırılmadı. POSIX dosya sahipliği Windows üzerinde path.posix ve kontrollü fs
ile doğrulandı; gerçek Linux dosya silme denemesi yapılmadı.
Ana Windows checkout master957bbfe9 ve kullanıcı untracked dosyaları korunur.
Önceki unmerged ses teslimleri bu dalda durur; master'a merge yapılmadı.

## CI takip düzeltmesi

İlk Windows CI (39371626333/job/118460565572) timeline-oracle-fuzz uniform offset kontrolünde düştü: negatif ara zamanlar geçerli iken yeni zaman doğrulaması bunları reddediyordu. Sonlu negatif zamanlar korunarak düzeltildi; null/boş/bool reddi devam eder. Eşik/test değiştirilmedi. timeline-oracle-fuzz 12/12 (400 uniform senaryo dahil), kalibrasyon ve yeni 10 regresyon yeniden geçti. Son ürün commit: `4c26c4640539f930aceaef2772baa8c1e841ba58`.

## Nihai Windows CI sonucu

[Run 39373036831 / Windows job 118465098525](https://github.com/dorukakindev/whisper-browser/actions/runs/39373036831/job/118465098525) belge HEAD `92e92ce091ce500a0b66c1b4bf85ab1bc81f69b6`, ürün HEAD `4c26c4640539f930aceaef2772baa8c1e841ba58`: **başarısız**, 7dk39sn. Yeni 10 regresyon ve timeline-oracle-fuzz geçti. İki kırmızı: `tests/atomic-write-kill.test.js` yazım-başlama kapsamı 8/22; `backend/test_sentence_distribution.py` içindeki `test_translate_rescue_scales_across_chunks_parallel` AssertionError31. İkisi de bu turda değişmeyen zamanlamaya duyarlı kontrollerdir; kök nedenleri bu teslimde kesinleştirilmedi, ortam kaynaklı olduğu kanıtlanmış sayılmaz. Tam paket yeşil iddiası yok. CI bridge/syntax adımları paket yüzünden atlandı; yerel hedefli bridge/syntax başarıları geçerlidir. Açık sınır olarak bırakıldı; test/eşik silinmedi veya gevşetilmedi. Master merge edilmedi.
