# Rapor598 — 50 maddelik ürün incelemesi ve ses güvenilirliği geliştirmeleri

## Kapsam ve sayım

Başlangıç master: 96dfa47e9cef23116b20936af38d30c0b527b11e. Dal: codex/product-focus598. Bitiş ürün/test commit'i: 6cbdee88a603ffce57a0c54c8a9d66053a8341ed.

Kullanıcının “üç beş değil, 50 şey” talebiyle [50 maddelik liste](PRODUCT_50_2026-10-26.md) oluşturuldu ve her madde gerçek kod üzerinden değerlendirildi. Sonuç: 11 maddede düzeltme, 10 maddede geliştirme, 29 maddede ilgili mevcut davranış sağlam. Bu 50 yeni özellik veya 21 bağımsız bug iddiası değildir. P01–P03 aynı cache doğrulama ailesidir; P12/P13 aynı sonlandırma kökünü, P22/P25 aynı SRT parser kapısını paylaşır. P46 yalnız kod teyididir; eski film görselinin yeni başlığı ezmesini engelleyen generation/isConnected kapısı okundu, yeni bir native ağ yarışı üretilmedi.

## Ürün değişiklikleri

- **Bozuk ve sessiz ses cache'i (P01–P03):** dub_quality.valid_audio yalnız WAV başlığına bakıyordu. Float WAV NaN/Inf veya dijital sessizlik taşısa da geçerli görünebiliyordu. Artık SoundFile üzerinden 65.536 frame bloklarla bütün dosya okunur; son bloktaki bozulma da yakalanır. Mono/örnekleme hızı/frame sayısı, sonlu örnekler ve en az bir sıfır dışı ses gerekir. Bellek dosya boyutuyla büyümez. Bu işitsel kalite veya gerçek konuşma tanıma garantisi değildir; sahte gürültü de bu teknik dosya kapısını geçebilir. Sadece çok düşük 1e-7 eşik kullanılır; normal düşük ses otomatik reddedilmez.
- **Referans/önizleme sınırları (P04–P06):** NaN örnekleme hızı, scalar/3D/boş kanal gibi geçersiz referanslar açık hata verir. Float WAV yüksek örneklerde RMS float64 hesaplanır; Infinity metadata yerine clipping uyarısı kalır. Boş önizleme [] döner; sıfır/ters/NaN grup süresi sıfıra bölme yerine açıkça reddedilir. Bunlar model kalitesini artıran yeni duygu motoru değildir; güvenilirlik kapılarıdır.
- **Worker protokolü (P07–P10):** İstek önce sınırsız okunup sonra boyut kontrolü yapılıyordu. readline(MAX+1) ile tahsis sınırlandırılır. JSON nesnesi, id türü/boyutu/kontrol karakterleri ve args türleri doğrulanır. Güvenilir id yoksa kontrollü DUB_WORKER_ERROR ve exit1; bozuk mesaja belirsiz tamamlanma gönderilmez. Runtime reset başarısızsa yeni iş kabul edilmez, süreç kapanır. Normal UTF-8 Türkçe yol ve shutdown korunur. Python protokol testinde reset başarısızlığı sahte runtime ile doğrulandı; gerçek CUDA reset hatası bu tur üretilmedi.
- **Sıcak motor sahipliği (P11–P15):** await release sırasında ikinci start önceki busy kontrolünü geçebiliyordu; starting rezervasyonu iki işin aynı host'a yerleşmesini engeller. CUDA_VISIBLE_DEVICES/CUDA_DEVICE_ORDER/PYTHONPATH/PYTHONHOME değişiklikleri warm host kimliğine eklendi. Doğrulanmış terminate tamamlandığında aktif run açık kalmaz; geç close ikinci kez sonuç üretmez. stdin/overflow aynı güvenli release yolunu kullanır. Başarısız terminate hâlâ başarı sayılmaz. Mevcut idle timer ve eski run kill korumaları da geçti.
- **İşaretli miktarlar (P17/P18):** -1.500/+1.500 kişi, €1.500 ve %1.500 açık miktar bağlamında doğal metne açılır. ID-1.500 gibi belirsiz kimlik biçimi korunur. SPOKEN_TEXT_VERSION v5 oldu; yeni üretim eski metin hazırlama cache kimliğiyle karışmaz. Eski dosyalar silinmez. Genel matematik/ondalık/tarih dönüştürücüsü iddiası yok.
- **Ses çıktısında olumsuzluk (P20):** Uzun konuşmada tek negatif fiil pozitif olunca yüksek genel similarity bunu gizleyebiliyordu. Python speech_check artık sınırlı Türkçe kök/ek kanıtını da karşılaştırır. JS düzenleme koruması ve Python doğrulaması aynı src/turkish-negation-roots.json listesini kullanır. Gitmem/giderim, okuyamam/okurum ve olmasın/olsun uzun metinde review'a düşer. Liste tam Türkçe morfoloji veya semantik eşdeğerlik garantisi değildir; yanlış ASR negatif kanıtı review gerektirebilir, konuşma otomatik silinmez.
- **Bozuk SRT zamanları (P22/P25):** Geçersiz dakika/saat veya yarım bitiş timestamp'i TIME_RE dışında kalıp konuşmayla birlikte sessizce kaybolabiliyordu. Timestamp biçimli aday satır gerçek saat parser'ıyla eşleşmezse satır numarasıyla ret verilir. Sonraki bozuk header önceki metne yutulmaz. Dosya otomatik düzeltilmez ve kaynak kimlikleri değiştirilmez.
- **Yerel ses kayıt limiti (P31/P32):** Aynı ses dosyasının tekrar seçilmesi yeni ID ve indeks slotu tüketiyordu. Artık aynı gerçek yol mevcut opaque ID'yi kullanır; Windows'ta yol harf büyüklüğü hesaba katılır. İndeks UUID/path türü, mutlak yol, uzunluk ve 2000 kayıt sınırıyla doğrulanır. Limit kontrolü grant öncesine alındı. Kullanıcının eksik/çıkarılabilir sürücüdeki kayıtları keyfi temizlenmez. grant false ve bozuk indeks dosyası testlerde korunur.
- **Asistan ülke seçimi (P42):** USA/UK regex'inde dört gerçek backspace karakteri vardı. Gerçek word boundary ile düzeltildi. Türkçe casefold nedeniyle İngilizce “Where can I watch...” içindeki I→ı dönüşümü de provider niyetini engelliyordu; ilgili kalıp iki biçimi kabul eder. USA→US, UK→GB ve Usak→boş ayrımı doğrulandı. Bu tur ücretli AI çağrısı yok.

## Sağlam çıkan alanlar

Liste her biri için ilgili kanıtı içerir. Öne çıkanlar: zamanlama fallback/cut review durumu; yinelenen miktarların ayrı tüketilmesi; offset/clip/source_ids; son satırda newline olmadan metin; PDF aralık tahsis sınırı; kitap pasaj/hash/current koruması; yalnız güncel review grubunu onarma; sıralı M4B metadata ve gerçek ffmpeg resampling; referans adının metadata olarak saklanması; müzik klibinin -ss/-t ekseni; sonlu gain fallback'leri; mute/rate ve geç play sahipliği; senkron haritası; asistan sourceKey/revision ve sayfa çeviri eylemi; Letterboxd sayfalama/host/kimlik sınırları. Gerçek sitelerin erişim politikası veya canlı yorum çekmenin her koşulda çalışması bu sonuçlardan çıkarılmaz.

## Kontroller ve ilk başarısızlıkların ayrımı

- tmp/focus598-checks.json: 21 ilgili Node dosyası geçti. tmp/focus598-adjacent.json: 8 ek ilgili Node dosyası geçti. Bunlar 29 benzersiz ürün hatası sayısı değildir. Yeni focus598-contracts, letterboxd-auto ve package-integrity ayrıca geçti.
- Python son durum: quality9, finish12, plan12, worker-protocol4 ve generation-quality19 geçti. Generation testindeki sahte EngineStalled/wrong-reference DUB_FAILURE satırları beklenen kontrollü hata senaryolarıdır.
- İlk generation koşusunda başarısız grubun sessiz placeholder'ı valid_audio ile geçerli bekleyen tek fixture kırıldı. O dosya hâlâ oynatılabilir (sf.info.frames>0); artık sessizlik yeniden kullanılabilir konuşma sayılmıyor. İki davranış ayrı assert edilir; cache kapısı gevşetilmedi.
- İlk worker testinin sandbox alt süreç çağrısı null status verdi; izinli tekrarda tüm worker testleri geçti. Yeni protokol testinin import sırası ve provider örneğindeki I/ı tetikleyicisi geliştirme sırasında düzeltildi; son sonuçlar yukarıdadır.
- Değişen JS dosyaları ile main/preload/renderer node --check, Python py_compile ve diff kontrolü geçti. Yeni JSON sözlüğünün requiredPackageFiles listesine transitif dahil olduğu ayrıca doğrulandı. Bağımlılık kurulmadı; install.bat/start.bat değişmedi.

## Gerçek Windows arayüzü

Ayrı profiller ve kontrollü veriyle:

| Senaryo | Kanıt | Sınır |
| --- | --- | --- |
| Dublaj durum/kalite/ayarlar | .uiprev/dub-runtime/1792975425382-1684 | fixture olaylar, actualGpu=false; 1/1.25 ölçek |
| Ayarlar | .uiprev/app-settings/1792975465142-21360 | 3 localhost isteği, harici provider çağrısı0 |
| PDF okuyucu | .uiprev/pdf-reader547-1792975468260 | Sentetik PDF/ses; gerçek model değil |
| Ana sayfa hero/eylemler | .uiprev/home-entry-actions-1792975482957 | Kontrollü katalog |
| Keşfet/asistan | .uiprev/media-discovery/1792975489055-14376-fixture | 940/680px; wheel ve filtre/geri dönüş; sentetik afişler |

Dublaj açık EN1.25 ve kompakt ayar açık EN PNG'leri gözle incelendi; diğer senaryolar etkileşim/ölçüm ve kayıtlarla doğrulandı. Her ekranın her görüntüsünün tek tek incelendiği iddiası yok. Fiziksel Windows DPI değiştirilmedi. Bu tur yeni tema veya gereksiz yedek sistemi eklenmedi.

## Sınırlar ve teslim

Tam npm test ve uzun CI sonucu beklenmedi. Gerçek TTS doğallığı, CUDA model başarımı, ücretli sağlayıcı, kişisel referans sesi, canlı YouTube/Letterboxd/DRM ve temiz start.bat kurulumu koşulmadı. Yalnız kontrollü testler için başarı ilan edilir. Önceki Rapor593'te ayrıca açık kalan video sonu taşma politikası ve şüphe niteliğindeki diğer işler bu liste yüzünden kapatılmış sayılmaz.

Kod/test ve belge commitleri ayrılır; normal PR üzerinden master ve kişisel dosyalar korunarak ana program teslim edilir. Kesin merge kimliği devir notunda verilir. OFFLINE-MANIFEST kişisel farkı ve ana kopyadaki Rapor516 satırı/untracked dosyalar Git'e alınmaz.
