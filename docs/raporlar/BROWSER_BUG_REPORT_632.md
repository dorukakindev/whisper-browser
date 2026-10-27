# Rapor 632 — Ürün derinleştirme ilk paketi, DeepSeek triyajı ve 1000 gece senaryosu

2026-10-27. Başlangıç master `7f3b0382c969ec183e7a7ebfddedf5d917c7b8ea`; kod bitişi `be3a8feefc0b70157513b6ca12b79439b84298f1`; dal codex/product-depth632. Kullanıcının 40 zor ürün işi talebi [durumlu planda](PRODUCT_DEPTH_40_2026-10-27.md) tutulur. 17 uygulama/kabul maddesi ve bir inceleme kapanmıştır; 22 madde bekler. Aynı özellik için birkaç kabul maddesi bağımsız bug sayılmaz. Kullanıcının arada istediği 1000 görev paketi ayrıca hazırlandı.

## Ürün geliştirmeleri

- Çok adımlı kart artık tam main job id'sini taşıyan continuationJobId ile iş defterini izler. İşi sürerken devam düğmesi devre dışıdır; tamamlandığında mevcut jobs-change event'i üzerinden açılır. Failed/stopped/missing/expired durumları açıklanır ve yanlış devam kapatılır. Durum sorgulamak için yeni model çağrısı veya polling yoktur; ana süreçteki exact-job gate korunur. Uygulama işleminin kabulü ile medya işinin tamamlanması ayrı kalır.
- Asistan search_library artık offset alır, count/offset/nextOffset/hasMore döner. İlk8sonuçtan sonrasına aynı filtrelerle erişilir. Gerçek20ID üç sayfada tekrarsız okunur; dosya yolları verilmez.
- Asistan text-only yanıtı dönerken main requireOwner tekrar doğrular; kaynak değişmişse renderer'daki mevcut kapıya ek olarak stale ok:true engellenir. Mutasyon/owner güvenliği gevşetilmez.
- OpenAI uyumlu endpoint son /chat/completions/ kanonik slashsiz biçime çevrilir; secret origin/HTTPS kapıları korunur. Sağlayıcı404'ü tüm servislerde kesin yaşanıyor iddiası yoktur.
- PDF konuşma haritası İngilizce I/i eşleştirmesini destekler; Türkçe sık/sik gibi anlamlı harf farkı korunur. Dil seçimi script ipuçlarına dayanır, bütün karma dilli PDF'ler için kusursuz eşleme iddiası yoktur. Kelime/zaman/numeric ayrım regresyonları korunur.
- Letterboxd ZIP dosya işleme sırası deterministiktir: reviews < watched < diary < ratings. Güncel ratings puanı tarihsel diary/review puanıyla ezilmez; diary olayının kendi puanı korunur. Gerçek ISO watchedDate için son tarih korunur. Duplicate review title/year/date/text ile tekilleştirilir; kopya diary.csv ikinci kez aynı olayları üretmez, aynı gün içindeki iki izleme ayrı kalır.
- PCM WAV süre kontrolü gerçek frame verisini sabit bellekli parçalar halinde okur; yarım dosya başlıktaki uzun süreyi geçerli saymaz. model_benchmark hata verir; live_asr mevcut hata→0 sözleşmesini korur. Bu TTS motorunun bütün çıktı doğrulamasını değiştiren bir iş değildir; DeepSeek bulgusunun gerçek benchmark/live-ASR kapsamıyla sınırlıdır.

## DeepSeek teslimi: 14 kayıt, 12 iddia edilen kökün triyajı

Kişisel denetim klasörü `DEEPSEEK-AUDIT-20261027T0242Z-coord-d0a1e655` okunarak değerlendirildi; ham rapor/profil/log/screenshotlar Git'e taşınmadı. Denetim başlangıç/bitiş HEAD'i4958e50d; bizde sonraki631 düzeltmeleri bulunduğundan tarihsel bulgular otomatik yeni bug sayılmadı.

| Kayıt | Güncel karar |
|---|---|
| T01-F001 | Ayar modalı iptali gerçekti; R631/PR530'da zaten giderildi. Open_voice_preparation tanı dosyası ise Uygulandı ile bitiyor; onu bu hatanın ayrı teyidi saymadık. |
| T01-F002 | Main son-owner savunması eksikti; gerçek stale cevap regresyonu yazıldı ve düzeltildi. Kullanıcı etkisini renderer gate zaten sınırlıyordu. |
| T01-F003 | Son slash normalizasyonu düzeltildi; her sağlayıcıda canlı404 kanıtı yoktur. |
| T02-F001, T05-F001, T06-F001 | Tek test-harness kökü. assistantJobs/observe helper bağımlılıkları eksikti; gerçek createJobs ve gerçek observe fonksiyonu kullanılarak üç kontrol tekrar çalışır oldu. Ürün sender/IPC eşiği gevşetilmedi. |
| T02-F002 | Scheduler'a hiç çözülmeyen uydurma taşıma verilince bekleme mümkün, fakat üretim requestBrowserSentenceTranslationAtEndpoint20/45/60s timeout+AbortController kullanıyor. Yeni üretim bugı doğrulanmadı, mevcut taşıma sözleşmesi kaydedildi; ikinci watchdog eklenmedi. |
| T02-F003 | KesikPCM başlığının süre iddiası benchmark/live-ASR yardımcılarında doğrulandı; wav_integrity ile reddedilir. TTS kalitesi/son parça üretim bugı diye genişletilmedi. |
| T03-F001 | English I/i fixture ile teyit; Türkçe harf ayrımı regresyonunu bozmadan giderildi. |
| T04-F001 | Çatışan ratings/diary puanı giriş sırasına bağlıydı. Öncelik ve ters ZIP sırası testiyle giderildi. |
| T04-F002 | Parser yinelenen reviews döndürüyordu; service zaten reviewId tekilleştiriyordu. Parser sonucu ve önizleme doğruluğu iyileştirildi; iki ayrı son kullanıcı veri kaybı sayılmadı. |
| T04-F003 | Ana sayfa native testinde eski modal/detail/menu/reader seçicileri vardı; güncel gerçek akışlar açıkça doğrulanıp test güncellendi. Yeni ürün bugı değil. |
| T04-F004 | Keşfet native testi sabit üç öneri varsayıyordu. Sayı yerine özet/kütüphane/zevk işlevleri sınanır, native geçti. |
| T06-F002 | ANSI/control günlük iddiası bu pakette ürün güvenlik/veri kaybı olarak doğrulanmadı. Ham tanı biçimi bilinçli olabilir; P20 kanıta bağlı inceleme olarak açık. |

## Testler / Windows

- 17 hedefli Node dosyası birlikte75/75geçti. Üçü kaynak-kesme testiydi; gerçek main sözleşmesi bağımlılıkları tamamlandıktan sonra bütün asılları çalıştı.
- Python: tests/test_report632_integrity.py3/3 ve test_report629_letterboxd.py3/3 geçti. Kesik stereoPCM, çelişen ZIP puanı, ters giriş sırası ve duplicate diary/review sınandı.
- Değişen JS node --check, beş Python py_compile, diff check geçti.
- Native Windows electron-assistant-evidence exit0: gerçek main/katalog/iki insan onaylı kart/continuation, kontrollü sağlayıcı,8fixtureistek. electron-media-discovery exit0:940/680px. electron-media-home exit0:1920/1440/940/680px, yerel medya/müzik/kitap ve mevcut oynatma yolları. İlk koşularda eski konumsal seçiciler ayrıca bulundu, gerçek kontrolle onarıldı; assertion silinmedi.
- Yeni electron-assistant-flow-state smoke exit0: gerçek Windows panelinde controlled snapshot/gerçek flow-state helper ile running/completed/failed; screenshotlar incelendi. Bu snapshot kabulü tek başına gerçek medya işinin bitmesi kanıtı değildir; gerçek ledger gate Node'da ayrıca sınandı. Ham görseller Git dışında `.uiprev/assistant-flow-state/1793075873321-7944/`; diğer üç native kanıt ilgili ignored .uiprev dizinlerindedir.
- Tam npm, uzun CI, gerçek model/ücretli API/canlı YouTube/Letterboxd/GPU/ses doğallığı/start.bat kurulum akışı koşulmadı. CI beklenmez/kapalı değildir. Launcher/install değişmedi. Yeni bağımlılık yok. Yeni opsiyonel tool offset ve event/receipt alanları geriye uyumlu; kalıcı şema migration yok.

## 1000 gece görevi teslimi

[Başlangıç](../denetim/deepseek-night1000-2026-10-27/BASLA.md), [README](../denetim/deepseek-night1000-2026-10-27/README.md). 50 ürün alanı ×20 ayrı risk mekanizması =1000 PLANLI satır; 10paket ×100, benzersiz id, task/method/invariant/acceptance/status/evidence alanları. Bunlar1000koşulmuş test/bug değildir. Her satır applicability kontrolü ister; anlamsız kombinasyona NOT_APPLICABLE ve somut neden verilir.

Global sözleşme her görevde gömülü: ana kod/mevcut test değişmez, fix/commit/push/merge yok, benzersiz çıktı dizini, gerçek exit/log/snapshot/repro, her25checkpoint ve her100ara teslim. Gerekli Playwright/test aracı kullanıcı yetkisiyle resmî kaynaktan ayrı venv/npm-prefix'e kurulabilir; ürün lock/venv/global sistem değiştirilmez. Native Electron/BrowserView ile Chrome fixture ayrımı açık, kişisel profil/CDP/key/ücretli API kullanılmaz. Daha az koşulursa1000bitti denmez. Sabaha kadar ifadesi bitmiş işi gereksiz yeniden koşma veya bizim otomatik zamanlayıcı yaratma talimatına çevrilmedi.

Yerel ZIP: `D:\Whisper Local\artifacts\deepseek-night1000-2026-10-27\DeepSeek-1000-Gece-Denetimi.zip`,133643byte,15dosya. CSV1000id ve10×100, manifestSHA256 ve ZIPCRC doğrulandı. İlk builder tırnak hatası parse aşamasında dosya yazmadan kaldı; düzeltildikten sonra üretildi. Test araçları bu belge işi sırasında kurulmadı; dış denetim gerektiğinde kurar.

## Kalan iş

40işlik planda22iş açık; P07 devam başarısızlığında retry token koruma, kitap/kalite grubu akışları, canlı adblock toparlanması ve gerçek ses/VRAM gibi işler bu paketle bitti sayılmaz. Paketli çalışma talebi doğrultusunda bu ilk doğrulanmış bölüm master'a teslim edilir. Kişisel190+dosya/değişiklikler korunur, açık uygulama kapatılmaz. Yeni kod normal yeniden açılışta alınır.
