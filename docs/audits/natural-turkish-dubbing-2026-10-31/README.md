# Doğal Türkçe dublaj — 31 Ekim 2026

Amaç: yabancı bir videoda Türkçenin anlamını, konuşma akışını ve zamanlamasını birlikte iyileştirmek; kullanıcıyı teknik ayar seçmeye zorlamamak. VoxCPM2/nano-vLLM motoru, mevcut ses referansları ve elle düzenleme yolları korunur.

## Kullanım

Videoda **SRT → Ses** açılır; altyazı ve referans ses seçilip **Dublajı başlat** kullanılır. Doğal dublaj önerisi kalite adımlarını, ayrıntılı metin/ses denetimini, konuşma düzenlemesini ve video zamanlamasını birlikte seçer. Ses, seçilen bölüm, gruplama, paralellik ve elle yazılmış metinler korunur. Teknik seçenekler gelişmiş bölümündedir. Özel tercihleri olan kullanıcı bunları kullanmaya devam edebilir.

Kaynak video uygunsa söyleyiş analizi otomatik denenir. Kaynak yoksa, ses dili belirsizse veya analiz güvenilir değilse seçilen referansla üretim sürer; bu durum kayda geçer. Özgün kaynak metin eşleştirilemiyorsa Türkçe metnin anlamını tahmin ederek yeniden yazmak yerine mevcut Türkçe korunur. Kısmi çeviride kalan yabancı satırlar ayrıca belirtilir.

## Uygulanan bağlantılar

1. **Kaynak anlamı ile son konuşma metnini bağlama.** Hem Whisper + çeviri hem mevcut SRT çevirisi aynı kaynak metadata sözleşmesini üretir. Özgün cümleler, kaynak/çıktı özetleri ve gerçek yazılan cue zamanları doğrulanır. Browser tarafında sahip olunan kaynak/çeviri asset bağlantısı kullanılır. Dublaj planını elle açmak gerekmez; gerekli model-free plan otomatik hazırlanır.
2. **Düzenlemeyi yeniden anlam denetiminden geçirme.** Son editör özgün cümleyi, yakın kaynak bağlamını ve mevcut terimleri görür. Değişen metin ayrıca kaynak ve mevcut çeviri karşısında ayrı bir anlam kontrolünden geçer. Sayı, olumsuzluk ve benzeri mevcut korumalar kaldırılmadı. Reddedilen/ulaşılamayan düzenleme ilk metni değiştirmez. Çocuk süreç de `source_reviewed` olmadan değişmiş yanıtı kabul etmez.
3. **Sahne ve cümle söyleyişi.** Yakın konuşma, soru, açık devam eden ifade ve konuşmacı/sahne sınırları için sınırlı yönlendirme hazırlanır. Normal bağımsız bildirme cümlesinde sırf özellik açık diye ek komut eklenmez; mevcut temiz referans devamı korunur. Yeniden yazılan/bölünen metnin noktalama rolü sentez öncesi yenilenir. Üretilmiş ses zincirleme yeni referans yapılmaz.
4. **Özgün söyleyiş planını sağlamlaştırma.** `anlatim` dahil dört gruplama yolu desteklenir. Kaynak enerji/perde/durak ölçümlerinin sahne tabanı ve güvenilirlik sınırları korunur; bilinmeyen veya gürültülü ses için duygu uydurulmaz. Soru ile çelişen düz ton talimatı verilmez.
5. **Gerçek süreyle geri besleme.** Video yavaşlatma modunda da ölçülen uzunluğa göre bir kaynak-bağlı alternatif denenebilir. Alternatif ancak daha kısa, akustik olarak kötüleşmemiş ve tamamı ASR ile doğrulanmışsa kullanılır; aksi hâlde ilk tam konuşma kalır. Anlamı budayarak zorla sığdırma yoktur; mevcut video yavaşlatma tercihine devam edilir.
6. **Sınırlı aday değerlendirmesi.** Ayrıntılı denetimde nesnel uzun kenar boşluğu/tempo/pencere taşması riski varsa en fazla bir alternatif denenir. Yeni sesin aynı beklenen metne ait olması, tam ASR denetimi ve ölçülebilir zamanlama iyileşmesi gerekir. Bu bir “insan doğallığı puanı” değildir. Hata, eksik ASR, stall/OOM veya reddedilen aday ilk kullanılabilir sesi yok etmez.
7. **Sade sonuç sunumu.** Hazırlık, üretim ve sonuç ayrıdır; boş inceleme kutusu gösterilmez. Kaynak metnin bulunamaması veya özgün söyleyişin kullanılamaması tamamlanmış gibi sunulmaz. İnceleme/A-B dinleme isteğe bağlıdır; ayrıntılı sayılar kapalı kayıt bölümündedir.

Ses önbelleği kimliği kaynak metin kanıtını, editör sürümünü ve söyleyiş bağlamını içerir. Aynı Türkçe dosya için farklı özgün kaynak/bağlamla üretilmiş eski ses yanlışlıkla yeniden kullanılmaz.

## Gerçek denemeler

- **DeepSeek-V4.1-Flash-1017 / DeepInfra, standard:** 8 yazılmış örnek, 9 HTTP 200 isteği. Bir soru daha doğal bir ifadeye dönüştürülüp ayrı anlam kontrolünden geçti; altı uygun metin değişmeden kaldı; bir süre kısaltması mevcut anlam korumasında reddedildi. Bu sonuçlar genel Türkçe çeviri üstünlüğü veya tüm konularda hatasızlık göstermez. Ayrıntı `live-editor.json`.
- Gerçek örnek: “Biz bu kadar yakınken, şimdi neden vazgeçmem gereksin ki?” → “Biz bu kadar yakınken şimdi neden vazgeçeyim ki?”
- **Gerçek VoxCPM2/GPU A-B:** aynı yerel referans, yazılmış Türkçe metin, 15 adım, sabit seed ve temel üretim ayarları. Eski yol ve yeni yol dört grubun tamamında hazır çıktı verdi; iki nihai WAV da son dosya ASR/bütünlük denetimini geçti. Eski/yeni bütün metin benzerliği 0.9268/1.0 oldu. Ölçülen toplam süreler 62.56/49.91 saniye; tek kısa koşudan genel hız kazancı çıkarılamaz. Canlı editör ve kaynak ses analizi bu A-B'nin içinde çalışmadı; ayrı bağlantı testleri vardır.
- Ses dosyaları ve kişisel referans yalnız yereldedir: `.uiprev/natural-dub-real/index.html` ile karşılaştırılabilir. İnsan dinlemesiyle kalite kazananı seçilmedi. Otomatik eşleşme iyi vurgu, duygu, aksan veya doğallığın tek başına kanıtı değildir.
- Gerçek Electron arayüzü: TR/EN, 1440/820/640 genişlik, klavye odağı, hazır/çalışan/sonuç durumları; ayrıca doğal/özel mod ve eksik kaynak bildirimi.
- Hedefli ve yerel paket sonuçları `validation.json` içinde tutulur. CI teslimden sonra arka planda çalışır; beklenmez.

## Sınırlar

Özgün konuşmacının kelime düzeyindeki vurgu/ironi/oyunculuğunu Türkçeye birebir taşıyan bir model eklenmedi. Buradaki gelişme, desteklenen VoxCPM2 koşullandırmasını daha doğru bağlam ve güvenilir kontrollerle kullanır. Referansın gürültüsü, Türkçe telaffuz niteliği ve kaynağın anlaşılırlığı sonucu hâlâ etkiler.

Eski metadata özgün cümleleri içermeyebilir; belirsiz/merge edilmiş browser cue eşlemelerinde de mevcut Türkçe korunur. AI anlam incelemesi bir kalite bariyeridir, matematiksel eşdeğerlik kanıtı değildir. Söyleyiş talimatları en iyi çaba ile uygulanır; insan dinlemesiyle kabul gerektiren alanlar açıkça ayrılır.

Kişisel uygulama ve ayarlar kapatılmadı/değiştirilmedi. Canlı API denemesinde şifreli profil dosyasının yalnız geçici test profiline alınması için kullanıcıdan açık onay alındı; geçici kopya silindi. Anahtar ve özel sesler bu teslimde bulunmaz.
