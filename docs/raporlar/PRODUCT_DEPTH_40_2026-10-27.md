# 40 maddelik ürün derinleştirme planı

Kullanıcı isteğiyle 2026-10-27 oluşturuldu. Başlangıç master 7f3b0382c969ec183e7a7ebfddedf5d917c7b8ea. Bu liste 40 hata iddiası değildir; geliştirme/inceleme/kabul işleridir. Her madde gerçek kanıtla tamamlanır veya açık kalan gerekçesiyle tutulur. DeepSeek 1000 gece paketi bu planın üründe uygulanması yerine geçmez.

| ID | Alan | İş ve kabul hedefi | Durum | Kanıt |
|---|---|---|---|---|
| P01 | Asistan | Çok adımlı kartta doğru işin anlık hazır/bekliyor/başarısız bilgisini göster. | TAMAMLANDI | assistant-flow-state ve native3durum |
| P02 | Asistan | Devam düğmesinin durumunu iş bitince kullanıcı yeniden sorgu atmadan güncelle. | TAMAMLANDI | assistant-jobs-changed mevcut event + flowInfo dinamik |
| P03 | Asistan | Başarısız/iptal işten yanlışlıkla sonraki adımı başlatmayı önle. | TAMAMLANDI | exact job blocked/failure regresyon |
| P04 | Asistan | Geç metin yanıtını main katmanında da güncel kaynakla doğrula. | TAMAMLANDI | agent-service stale-final-text regresyon |
| P05 | Asistan | Kütüphane aramasında sekiz sonuç sonrası gerçek sayfalama ekle. | TAMAMLANDI | search_library offset ve gerçek20ID |
| P06 | Asistan | Arama sonucunda toplam/gösterilen/devam bilgilerini açık sun. | TAMAMLANDI | count/offset/nextOffset/hasMore |
| P07 | Asistan | Araç zaman aşımı/başarısızlık sonrası geri kazanılabilir devam isteğini kaybetme. | PLANLANDI | — |
| P08 | Asistan | Genel iptalde medya işi ile sohbet isteğinin farkını kullanıcıya göster. | PLANLANDI | — |
| P09 | Çeviri | Kaynak-revizyon regresyon kontrolünü gerçek iş defteri bağımlılığıyla yeniden çalıştır. | TAMAMLANDI | gerçek ledger/observe helper ile test geçti |
| P10 | Browser | Sekme çöküşü kontrolünün iş defteri temizliğini gerçek harness ile doğrula. | TAMAMLANDI | crash helper ledger kontrolü geçti |
| P11 | Güvenlik | Adversarial IPC testini yeni job ledger sözleşmesiyle tekrar işler yap. | TAMAMLANDI | adversarial IPC kontrolü geçti |
| P12 | Çeviri | Scheduler request timeout taşıma sözleşmesini incele; üst katman kapısı yetmiyorsa somut düzeltme yap. | İNCELENDİ — mevcut kapı yeterli | main.js request başına20/45/60s AbortController mevcut; yeni üretim bugı doğrulanmadı |
| P13 | Ses | Kesik WAVın başlıktaki sahte süresini geçerli ses süresi saymasını engelle. | TAMAMLANDI | wav_integrity ve kesikPCM testi; benchmark/live-ASR kapsamı |
| P14 | PDF | İngilizce I/Türkçe İ/ı sesli pasaj eşlemesini kayıpsız düzelt. | TAMAMLANDI | PDF EnglishI ve Türkçe sık/sik ayrımı testi |
| P15 | Letterboxd | ZIP alan birleştirmesine açık ve deterministik kaynak önceliği getir. | TAMAMLANDI | ratings>diary>watched>reviews ve conflict ZIP testi |
| P16 | Letterboxd | İki klasörde yinelenen reviews.csv yorumlarını kanıt kimliğiyle tekilleştir. | TAMAMLANDI | review kimliği + diary rewatch index tekilleştirme |
| P17 | Katalog | Medya aç kabulünü gerçek modal medya merkezi davranışıyla doğrula. | TAMAMLANDI | native home exit0; modal/detail/tools/reader selector güncel |
| P18 | Keşfet | Asistan önerileri kabulünde sabit düğme sayısı yerine işlevleri doğrula. | TAMAMLANDI | native discovery exit0; gerçek öneri işlevleri doğrulandı |
| P19 | Asistan | Endpoint son slash normalizasyonunu katı sağlayıcılarla uyumlu yap. | TAMAMLANDI | endpoint canonicalization regresyon |
| P20 | Tanılama | Kontrol karakterlerinin log görünümü ve NDJSON güvenilirliğine etkisini kanıtla; gerçekse ortak temizleme uygula. | PLANLANDI | — |
| P21 | Kitap | Aralık seçiminin asistan kartı ve gerçek üretim planında aynı kalmasını incele. | PLANLANDI | — |
| P22 | Kitap | Okuyucu kaynak değişince eski ses planının geçerlilik bilgisini görünür yap. | PLANLANDI | — |
| P23 | Dublaj | Kalite listesinden sorunlu gruba gidip kısa ses aralığını dinleme akışını geliştir. | PLANLANDI | — |
| P24 | Dublaj | Yalnız düzenlenen grubun yeniden üretiminde stale sonuçların yeni metni ezmesini önle. | PLANLANDI | — |
| P25 | Çeviri | Ses için çeviride sayı/olumsuzluk/süre kısıtına göre anlaşılır kalite özeti geliştir. | PLANLANDI | — |
| P26 | Çeviri | Altyazı zaman aralığı ile dublaj aralığı aktarımında kullanıcı düzenlemesini koru. | PLANLANDI | — |
| P27 | Browser | Adblock etkin kalırken sonlu YouTube yükleme toparlanmasını incele. | PLANLANDI | — |
| P28 | Browser | Video altyazısı yokken asistanın doğru Whisper/caption seçimini açıklaştır. | PLANLANDI | — |
| P29 | Kitap | Ses oynarken sayfa değişimi ve manuel scroll sahipliğini iyileştir. | PLANLANDI | — |
| P30 | PDF | Uzun belgede render task/URL/canvas kapanış yaşam döngüsünü derin incele. | PLANLANDI | — |
| P31 | Katalog | Devam carousel seçimini yeniden açılış/metadata güncellemesinde koru. | PLANLANDI | — |
| P32 | Katalog | Büyük kütüphane aramasında kimlik tekilleştirmesini kaynak türleri arasında ölç. | PLANLANDI | — |
| P33 | Tasarım | Dar asistan panelindeki yatay öneri şeridine erişilebilir kaydırma kontrolü değerlendir. | PLANLANDI | — |
| P34 | Tasarım | Kart uygulama ve devam durumlarının klavye/focus geri dönüşünü iyileştir. | PLANLANDI | — |
| P35 | Asistan | Kaynak bağlamının tam/kısmi/yalnız metadata oluşunu kullanıcıya açık göster. | PLANLANDI | — |
| P36 | Asistan | Büyük/eksik araç kanıtında modelin aşırı tamamlandı iddiasını engelle. | PLANLANDI | — |
| P37 | Ses | Referans dosyası aynı yolda değişince fingerprint/cache davranışını incele. | PLANLANDI | — |
| P38 | Ses | Motor hazır değil/VRAM dolu durumunda anlaşılır önkoşul ve güvenli tekrar deneme sun. | PLANLANDI | — |
| P39 | Entegrasyon | Asistan→altyazı→çeviri→dublaj için sentetik çok aşamalı kabul paketi çalıştır. | PLANLANDI | — |
| P40 | Teslim | Değişiklikleri hedefli Windows görüntüleriyle doğrula, ayrı kod/belge commitleri ve master teslimi yap. | TAMAMLANDI | Rapor632 ve ayrı kod/belge teslimi |

Durum: 17 uygulama/kabul maddesi tamamlandı; P12 incelendi, mevcut taşıma deadline kapısı yeterli bulundu. 22 madde PLANLANDI durumunda kalır; bu belge 40 işin bittiği iddiası değildir. P40, bu ilk paketin teslim döngüsüdür; kalanlar için ayrıca doğrulama/uygulama gerekir. Son ürün commit be3a8feefc0b70157513b6ca12b79439b84298f1.
