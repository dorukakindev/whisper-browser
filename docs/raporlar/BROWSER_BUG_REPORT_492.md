# BROWSER_BUG_REPORT_492 — Çeviri, altyazı ve kurtarmada 20 düzeltme

Repo: https://github.com/dorukakindev/whisper-browser · [PR464](https://github.com/dorukakindev/whisper-browser/pull/464)
Dal: codex/broad-bugs492.
Başlangıç HEAD: d51b423348aca8883484e795e1942f4e02302cd5.
Bitiş ürün/test: b711e1581ee428d467ed213a5649b3ba621382a0.
Fetch ile doğrulanan master: 957bbfe91edee709accb24624e9e945e7a7a2969.

## Doğrulanan bulgular

Her satır tests/report492-regressions.test.js içindeki aynı numaralı davranış
testine karşılık gelir. Önceki raporların teslimleri yeniden sayılmadı.

| No | Önceki gerçek davranış / kök neden | Düzeltme ve kanıt |
|---|---|---|
| 492-01 | İngilizce parçaları birleştiren ikinci geçiş, ilk geçişte korunan protected cue ve bozuk cue sınırlarını yeniden birleştiriyordu. | Koruma bilgisi cümle ve parçalarda taşınır; ikinci geçiş sınırı aşmaz. İki örnekte iki cümle korunur. |
| 492-02 | İptali dinlemeyen eski sağlayıcının başarılı yanıtı, yeni oturumun kalite ret sayacını sıfırlıyordu. | Başarı sayacı yalnız aynı kuşakta ve iptal edilmemiş işte değişir. Geç yanıt sonrası yeni sayaç 3 kalır, eski sonuç yazılmaz. |
| 492-03 | Kimliksiz eşzamanlı repliklerde iki yeni cue aynı eski cue ile eşleniyordu; bir replik yanlış eksik sayılıyor ve yanlış metin geri alınabiliyordu. | Önceki cue yalnız bir kez kullanılır. Tam ve kısa diff yollarında ikinci replik B ile eşleşir; sahte eksik yok. |
| 492-04 | İncelemede silinen konuşmacı, aynı zamanlarda başka bir konuşmacı durduğu için geri alınamıyordu. | Geri ekleme, mevcut diğer konuşmacı yerine geri alınacak cue kimliğini kontrol eder. A korunur, B geri eklenir; B zaten varsa tekrar engellenir. |
| 492-05 | İnceleme açıkken başka kimlikli ama aynı zaman/metinli cue yüklenirse eski seçim yeni cue'yu değiştirebiliyor veya silebiliyordu. | İnceleme snapshot'ı kimlik taşır; değişiklik/ekleme ve eski seçim doğrulaması bunu karşılaştırır. |
| 492-06 | Diff temizleyicisi bütün açı parantezlerini tag sanıyordu: x < 5 > y ile x < 9 > y aynı kabul ediliyordu. | Yalnız bilinen biçim etiketleri ayıklanır. Sayı değişikliği görünür, gerçek italik biçimi değişiklik sayılmaz. |
| 492-07 | Bütünlük raporu, başka bir cue kimliğini zamanlar eşleştiğinde geçerli kaynak çevirisi sayıyordu. | Açık fakat yabancı kimlik zaman fallback'ine giremez. Yabancı sonuçla translated=0 ve partial döner. |
| 492-08 | Çökmede journal'ın son JSON satırı yarım kalırsa sonraki append bu satıra yapışıyor, ilk yeni çeviri tekrar açılışta kayboluyordu. | Eksik satır sonu izlenir ve sonraki append öncesi ayraç yazılır. Kısmi append hatasından sonra da ayraç zorlanır. Gerçek geçici dosya yeniden okununca Yeni kaydı korunur. |
| 492-09 | PDF komşu paragrafı string gönderiyor, tek-cue sağlayıcı isteği dizi bekleyip .map is not a function ile API öncesinde düşüyordu. | İstek sınırında string/dizi bağlam ortak satır biçimine çevrilir. Gerçek production fonksiyonu kontrollü fetch'e ulaşır; önceki/sonraki paragraf doğru gönderilir. |
| 492-10 | PDF cache bağlamında endpoint ve belge kimliği yoktu; aynı model adıyla farklı sağlayıcıda önceki sağlayıcının çevirisi kullanılabiliyordu. | Sağlayıcı endpoint'i, PDF hash'i, sayfa kimliği ve prompt sürümü anahtara katılır. İki endpoint farklı cache anahtarı üretir. Belge hash'i yoksa kalıcı cache kapalıdır. |
| 492-11 | YouTube lang=en&tlang=tr ile alınan Türkçe altyazı en diye etiketleniyordu. | Yanıt Content-Language başlığı yoksa tlang kaynak lang parametresinden önce okunur. |
| 492-12 | İlk durdurma sinyali teslim edilemezse _terminating bayrağı kalıcı true kalıyordu; kullanıcı aynı canlı süreci tekrar durduramıyordu. | Sinyal teslimi başarısızsa yalnız sonlandırma girişimi kilidi açılır. Süreç sahipliği/kapanış bilgisi korunur; ikinci durdurma tekrar sinyal dener. Gerçek Windows süreç ağacı testi de geçti. |
| 492-13 | WebVTT NOTE bloğundaki örnek zaman kodları gerçek altyazıya ve çeviriye giriyordu. | WebVTT metadata blokları genel zaman taramasından önce ayrılır. Yorumdaki sahte cue yok, gerçek diyalog korunur. SRT kurtarma yolu korunur. |
| 492-14 | Farsça/Arapça birleştirme ve yön işaretleri doğrudan yazıldığında korunuyor, sayısal entity biçiminde yazıldığında siliniyordu. | ZWNJ/ZWJ/LRM/RLM için iki kodlama aynı metni verir. RLO gibi spoof kontrolleri ayıklanmaya devam eder. |
| 492-15 | Namespace kullanan TTML span ve br etiketleri metinde kalıyordu; XML işaretleri ekranda/çeviride diyalog olabiliyordu. | Bilinen biçim etiketleri ve satır kırması namespace ile de temizlenir. Üretim parser'ı Hello + satır sonu + World döndürür. |
| 492-16 | ASS Name/Actor alanı atıldığı için aynı anda aynı sözü söyleyen iki konuşmacı dedup sırasında tek satıra düşüyordu. | Aktör bilgisi speaker olarak taşınır. Alice ve Bob'un Yes. replikleri iki cue olarak kalır. |
| 492-17 | Ağdan gelen derin TTML stil referans zinciri sınırsız recursion ile ana süreçte RangeError üretiyordu. | Derinlik 64, bir çözümlemenin toplam referans işi 512 ile sınırlı; 9000 bağlantıda diyalog kaybolmadan parser döner. Aşırı derin biçim mirası sadeleştirilebilir. |
| 492-18 | Sağlayıcı kesicisinde sadece kuyrukta bekleyen, henüz gönderilmemiş cümleler denenmiş sayılıyordu. Seek sonrası yeniden dene eski pencerenin tüm bekleyen işlerini zorla çağırabiliyordu. | Yalnız pending ve gerçekten başarısız işler attempted sayılır. Dört işin ikisi gönderilince kalan ikisi deferred kalır; uzak seek sonrası iki gerçek hata yeniden denenir. |
| 492-19 | Elle yeniden dene sağlayıcı hata sayacını sıfırlarken kesin/protokol hatası sayacını taşımaya devam ediyordu; ilk yeni hatada kesici hemen tekrar açılıyordu. | Kesin hata serisi de yeniden başlar. İkinci turdaki bir hatadan sonra sıradaki başarılı cümle tamamlanır. |
| 492-20 | Model/kanal kesin kullanılamaz hatasında kesici başarısızlık türünü kaybediyordu; ağ her geri geldiğinde geçici hata gibi otomatik yeniden istek açılıyordu. | Kesici kesin/geçici ayrımını ve önceki kalite türünü korur. onlyTransient yeniden deneme kesin model hatasında sıfır iş açar; elle kurtarma kullanılabilir. |

## Kanıt ve test kapsamı

- Başlangıç ürün kodunun ignore tmp/report492/before kopyasında yeni dosya:
  node --test tmp/report492/before/tests/report492-regressions.test.js
  → **20 test, 0 pass, 20 fail**. Eksik bağımlılık değil; davranış assertion'ları,
  PDF TypeError ve TTML RangeError gösterildi.
- Son ürün kodu: yeni 20 regresyonun tamamı geçti.
- Hedefli 14 dosya, Node runner **57/57**:
  report492-regressions, translation-review-tools, report478-regressions,
  browser-translation-integrity, browser-translation-job-context,
  browser-translation-refresh, browser-translation-quality-loop,
  browser-translation-reliability, browser-translation-provider-error,
  browser-translation-cache, browser-subtitles, subtitle-sentence-layout,
  pdf-state-deadzone ve process-lifecycle (hepsi .test.js).
  Bazı eski dosyalar kendi iç testlerini tek runner girdisi altında çalıştırır;
  57 sayısı bütün assertion'ların sayısı değildir.
- npm run test:electron-bridge: Windows'ta geçti.
- Değişen JS, preload ve renderer.js dahil node --check; git diff --check geçti.
- Ham yerel koşu kayıtları ignore tmp/report492/before.txt ve targeted.txt;
  kullanıcı profili, ses, token veya özel medya Git'e eklenmedi.

## Sınırlar ve teslim

Yeni UI kontrolü veya görsel stil eklenmedi; veri/iş yaşam döngüsü onarıldı.
Gerçek YouTube, canlı sağlayıcı, gerçek model/GPU/CUDA, DRM, dosya seçici,
DPI ve normal üretim start.bat açılışı bu turda denenmedi. Tam npm test ve
Python paketi çalıştırılmadı; Python ürün kodu değişmedi.
Kontrollü fetch başarısı gerçek çeviri kalitesini kanıtlamaz.
Yeni paket/model, kurulum, ayar dosyası veya disk şeması değişikliği yok.
PDF cache kimliği değiştiği için ilk ilgili çeviri yeniden istenebilir.

CI açık bırakıldı; kullanıcının isteğiyle sonucu beklenmedi/doğrulanmadı.
Önceki PR457–463 teslimleri dalda korundu. Bu turun ürün/test farkı 8 dosya;
master karşılaştırması önceki teslimler nedeniyle daha büyük. Master'a merge
yapılmadı ve D:/Whisper Local ana uygulama checkout'u güncellenmedi.
[Tarihli devir](../devir/2026-10-20-1105.md).

Son inceleme: yalın NOTE başlığı da 492-13 içinde kapsandı. İlk kod commit’i
4fdc45d2723c916640296285c5451f72ccf7f517, tamamlayıcı kod commit’i
b711e1581ee428d467ed213a5649b3ba621382a0. Son iki dosyalık koşu runner 21/21;
20 regresyon + mevcut browser-subtitles dosyası geçti. Yeni bulgu sayılmadı.
