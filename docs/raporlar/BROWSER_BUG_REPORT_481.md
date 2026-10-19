# BROWSER_BUG_REPORT_481 — Abonelik metni ve medya zaman sınırları

2026-10-19, dal `codex/browser-audit477`, PR454.
Başlangıç HEAD: `078ffa12aa228eca1362cfab27301e3137fa0b94`.
Başlangıç ürün kodu: `5e09ac362d2fee394a21968b804b410faa41ed6a`.
Bitiş ürün kodu: `a333d82f1f84862307d003fbdd9d4bcae48c82fe`.
Master fetch: `68775abbfdacff72ee48095e9ee8cb74009bff49` (ilerlememiş).
Mevcut master tabanlı açık PR üzerinden devam edildi; ana checkout korunur.

| No | Önem | Kök neden / kanıt / düzeltme |
|---|---|---|
| 481-01 | Orta | CSV importer satır ve virgülden doğrudan bölüyordu; kendi exporter'ının ürettiği virgüllü, tırnaklı veya çok satırlı kanal adı parçalanıyordu. Tırnak durumlu okuyucu çift tırnak escape ve quoted newline'ı korur; kapanmamış alıntıyı reddeder. |
| 481-02 | Orta | OPML attribute'ları yalnız çift tırnak ve ham XML olarak okunuyordu; export/import kanal adında &amp; veya &quot; artıkları bırakıyor, single-quote dosyayı düşürüyordu. Attribute sınırları, iki alıntı biçimi ve tek geçişli XML entity decode düzeltildi. |
| 481-03 | Orta | Kanal handle doğrulaması yalnız ASCII ve URL'de ham regex kullanıyordu; @Örnek veya yüzde kodlu adres içe/dışa aktarımda kayboluyordu. Unicode harf/işaret/rakam ve decode edilmiş YouTube pathname kabul edilir. Handle URL hostname sınırı yanlış suffix eşleşmesini de önler. Invidious channel-id yolu korunur. |
| 481-04 | Düşük | RSS numeric XML entities çözülmediği için Türkçe harf/emoji yerine &#...; görünüyordu. Decimal/hex code point güvenli ve tek geçişli çözülür; invalid scalar olduğu gibi kalır, &amp;#65; iki kez çözülmez. |
| 481-05 | Düşük | RSS CDATA önce açılıyor sonra entity replace çalışıyordu; literal &amp; içeriği yanlışlıkla & oluyordu. CDATA ve entity token'ları aynı geçişte ayrılarak CDATA metni korunur. 481-04'ten farklı XML içerik semantiği, aynı helper'da düzeltildi. |
| 481-06 | Orta | Kütüphane sanal listesinde filtre/silme sonrası eski scrollTop yüksek kalınca start>end ve dev topSpace çıkıyordu. Scroll başlangıcı mevcut liste extent ve viewport aralığına kısılır; boş liste 0..0 olur. Odak/overscan mevcut testleri korunur. |
| 481-07 | Orta | Oturum finiteNumber null/false/boş dizgeyi 0 kabul ediyordu; volume null sesi kapatıyor, rate boş 0.25'e iniyordu. Sayı veya dolu sayısal dizge dışı değer varsayılana döner; bilinçli volume0 korunur. Önceki closed-tab düzeltmesinden ayrı kalıcı session store yoludur. |
| 481-08 | Düşük | Chapter başlangıcında false veya boş dizge Number ile 0 oluyor, bozuk bölüm video başına ekleniyordu. Gerçek sayı/dolu sayısal dizge kontrolü; geçerli 0 ve alias'lar korunur. Önceki geçersiz end düzeltmesinden ayrı start sorunudur. |
| 481-09 | Orta | Word-sidecar yalnız kelimenin segment ile kısmen kesişmesini arıyordu; 10..12 segmentindeki 1..100 kelime kabul ediliyordu. Segment sınırını 50ms'den fazla aşan kelime elenir; küçük yuvarlama sapması segment içine kırpılır. Geçerli kelime metni/olasılık korunur. |
| 481-10 | Düşük | Timeline taraması belgelenen 3+ satır uyarısını >3 karşılaştırmasıyla dört satırda başlatıyordu. Üç satır da işaretlenir; iki satır temizdir. Çıktı içeriği değiştirilmez, yalnız mevcut kalite uyarısı düzelir. |

## Doğrulama

`node tests/report481-regressions.test.js`: ürün düzeltmesinden önce 10 FAIL,
sonra 10 PASS. Hedefli mevcut testler: subscriptions-io, subscription-feed35,
browser-chapters13, browser-session-corrupt426, browser-session-package,
subtitle-word-highlight, timeline-issue-scan9, watch-library-performance9,
ui-locale14 ve ui-locale-dedupe5 geçti. Değişen JS ve yeni test syntax/diff
kontrolleri geçti. Tam paket yerelde çalıştırılmadı; Windows CI ayrıca takip
edilecek, sonuç görülmeden başarılı denmeyecek.

Yeni düğme/CSS/şema/bağımlılık/kurulum yok. Yeni CSV hata metni TR/EN sözlükte.
Gerçek Windows start.bat, Electron UI/DPI, YouTube/provider/GPU/model denemesi
yok; terminal fixture başarısı gerçek site veya görsel doğrulama değildir.
Kullanıcı profili/ana checkout ve kişisel dosyalar değiştirilmedi.
