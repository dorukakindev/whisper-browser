# Kod geliştirme ve teknik borç yol haritası — 25 Ekim 2026

Bu belge yeni bir “586’dan fazla kesin bug var” iddiası değildir. `master` / `263d72c9c619630b9e193fd50cdbb8c0a32e1264` üzerindeki mevcut mimari, son devir notları ve kaynak dosya büyüklükleri incelenerek hazırlanmış **uygulanabilir öncelik listesidir**. “Risk doğrula” maddeleri gerçekleşmiş veri kaybı kanıtı olarak okunmamalıdır. Ürün kodu bu çalışmada değiştirilmedi.

## Yönetici özeti

En yüksek getiri yeni özellik eklemekte değil; üç alanı sırayla sağlamlaştırmaktadır:

1. **Veri ve iş güvenliği:** uzun ASR/çeviri/dublaj işlerinin kurtarılabilirliği, iptali ve çıktı bütünlüğü.
2. **Kaliteyi ölçülebilir yapmak:** gerçek medya/çeviri/ses korpusları ve regresyon eşikleri.
3. **Değişiklik maliyetini düşürmek:** `src/main.js`, `src/renderer/renderer.js` ve `backend/transcribe.py` içinden davranışı değiştirmeden dar modüller çıkarmak.

`renderer.js` yaklaşık 1,59 MB, `main.js` yaklaşık 1,08 MB, `transcribe.py` yaklaşık 503 KB’tır. Bu tek başına kusur değildir; fakat bir değişikliğin etkisini sınırlamayı ve hedefli test yazmayı zorlaştırır. Büyük bir yeniden yazım yerine aşağıdaki aşamalı plan uygulanmalıdır.

## Öncelik anahtarı

- **P0:** veri kaybı, yanlış başarı, güvenlik veya uzun işin tamamen boşa gitmesi riski; önce ele alınmalı.
- **P1:** ürün kalitesi ve güvenilirliği için yüksek getirili iş.
- **P2:** bakım, performans ve geliştirici deneyimi; P0/P1 davranışı korunarak yapılmalı.
- Her maddenin kabul testi, yalnız “kod derlendi” değil davranışın doğrulanması olmalıdır.

---

## P0 — Önce güvenilirlik ve veri koruması

### 1. Uzun işler için birleşik iş durum makinesi ve kurtarma sözleşmesi

**Kod:** `backend/transcribe.py` (`main()`, `transcribe()`, NDJSON `emit()`), `src/main.js` (`transcribe:start`, subprocess yaşam döngüsü), `src/renderer/renderer.js` (kuyruk ve `done`/`error`/`exit` işleme), ayrıca `src/dub-service.js`.

**Neden:** ASR, çeviri ve dublaj ayrı süreç/kanal ve ayrı ilerleme biçimleri kullanıyor. Uygulama kapanması, Python’un beklenmedik çıkışı veya renderer’ın yeniden yüklenmesi durumunda “arayüzdeki durum”, “diskte kalan ara çıktı” ve “gerçekten çalışan süreç” aynı şey olmayabilir. Uzun filmde yanlış `done`, sahipsiz süreç veya sıfırdan başlatma çok pahalıdır.

**Öneri:** Ortak bir `JobSnapshot` şeması tanımla: `jobId`, `kind`, `state`, `attempt`, `inputIdentity`, `settingsHash`, `completedUnits`, `currentUnit`, `outputManifest`, `updatedAt`. Backend yalnız olay basmasın; ana süreç önemli olayları atomik snapshot’a bağlasın. `done` yalnız zorunlu çıktı manifesti ve doğrulama tamamlanınca yayımlansın. Açılışta yarım işler “devam et / ara çıktıyı koruyarak yeniden başlat / arşivle” seçenekleriyle gösterilsin.

**Kabul:** Her aşamada zorla kapatma testi; eski `jobId` olayının yeni işi değiştirememesi; iptal edilen işin `done` olmaması; tamamlanmış parçaların gereksiz yeniden üretilmemesi; bozuk/eksik manifestle başarı gösterilmemesi.

### 2. Çıktı dosyaları için yazma–doğrulama–atomik tamamlama standardı

**Kod:** `backend/transcribe.py` (`write_srt`, `write_vtt`, `write_ass`, JSON/TXT yazıcıları ve `reexport_from_json()`), dublaj/M4B üreten servisler, `src/main.js` içindeki dosya taşıma/yeniden adlandırma yolları.

**Neden:** Altyazı, JSON ve ses çıktıları kullanıcı emeğidir. Disk dolması, kilitli dosya veya işlem ortasında kapanma sonunda eski iyi dosya ile yeni kısmi dosyanın karışmaması gerekir. Biçimlerin kendi yazıcıları olması nedeniyle tek bir yerde tutarlı garanti tanımlanmalıdır.

**Öneri:** Aynı klasörde geçici dosyaya yaz; temel doğrulamayı yap (beklenen cue sayısı, monoton zamanlar, JSON parse, ses için ffprobe ve sıfır olmayan süre); kapanış/flush sonrası atomik replace uygula. Eski dosya korunacaksa açık yedek politikası kullan. Sonuç manifestine boyut/hash/süre ekle.

**Kabul:** Yazımın her noktasında hata enjeksiyonu; eski dosyanın korunması; `.tmp` dosyasının başarılı çıktı diye listelenmemesi; Windows `EPERM`/disk dolu ve Türkçe/uzun yol testleri; re-export’un kaynağı değiştirmemesi.

### 3. İptal ve uygulama kapanışında süreç ağacı sahipliğini tek yerden doğrula

**Kod:** `src/main.js` içindeki `spawn`, `transcribe:cancel`, `burnin:cancel` ve kapanış yolları; `src/dub-service.js`; `backend/transcribe.py` içindeki ffmpeg/yt-dlp/model çağrıları.

**Neden:** Python’u durdurmak onun başlattığı ffmpeg, yt-dlp, ayırıcı veya TTS alt sürecini her platformda otomatik durdurmaz. GPU belleği ve CPU kullanımı devam ederse yeni iş başarısız olabilir; “iptal edildi” gösterilirken dosya yazılması da olabilir.

**Öneri:** Her iş için sahiplik kaydı, Windows süreç ağacı sonlandırma adaptörü ve sonlandırma sonrası doğrulama ekle. İptali iki aşamalı yap: önce yeni çalışmayı kes, kontrollü kapanışa kısa süre ver, sonra yalnız sahip olunan ağacı sonlandır. PID yeniden kullanımına karşı başlangıç kimliği sakla; genel `taskkill` kalıbı kullanma.

**Kabul:** İndirme, ffmpeg, model, çeviri ve son normalizasyon aşamalarında ayrı iptal; alt süreç kalmadığının doğrulanması; iki ardışık iptalin güvenli olması; eski iptalin yeni işi öldürmemesi; `start.bat` ile gerçek Windows kabulü.

### 4. Güvenli IPC için kanal bazlı yetki ve gönderen doğrulaması envanteri

**Kod:** `src/preload.js`, browser preload köprüleri, `src/main.js` içindeki bütün `ipcMain.handle/on` kayıtları, browser view oluşturma ve navigasyon kodu.

**Neden:** Proje artık yalnız altyazı değil; browser, AI, dosya sistemi, dış bağlantı, ayarlar ve ses üretimi de içeriyor. Her yeni kanalın ayrı kontrolü yerine merkezi yetki modeli olmazsa geniş yetkili bir kanalın yanlış webContents’ten çağrılması ihtimali büyür. Bu madde var olan bir açık iddiası değil, sistematik denetim ve kalıcı koruma işidir.

**Öneri:** Kanal tablosu üret: alıcı, izinli sender, argüman şeması, dosya/ağ etkisi, rate limit. `handle` kaydı için ortak wrapper sender’ı ve şemayı doğrulasın. Browser’dan gelen istekleri ana renderer’dan ayır; dış URL açma ve dosya yazmada izinli hedefleri sınırla. Testlerde yetkisiz sahte gönderen gerçek Electron ile reddedilsin.

**Kabul:** Her kanalın envanterde bulunması; geçersiz tür/derinlik/boyutun reddi; çökmüş veya yok edilmiş webContents’in güvenli reddi; yetkisiz origin/view’in dosya, ayar, secret ve shell işlemine erişememesi.

### 5. Ayar/proje/kütüphane şemalarında sürümlü ve geri alınabilir migrasyon

**Kod:** `src/main.js` ayar ve pencere durumu kalıcılığı, `src/renderer/renderer.js` (`scheduleSave`, `_applyingSettings`, kuyruk ve proje kayıtları), dublaj proje/import-export kodları.

**Neden:** Yeni alanlar hızla ekleniyor. Eski profille yeni sürüm, yeni profille eski sürüm ve bozuk JSON senaryolarının ortak sözleşmesi yoksa alanların sessizce varsayılana dönmesi kullanıcı ayarını veya proje bağlantısını kaybettirir.

**Öneri:** Her kalıcı belgeye `schemaVersion` ve doğrulama ekleyin; migrasyonları saf ve tek yönlü fonksiyonlar yapın. Yüklemeden önce bilinmeyen sürümü ezmeden koruyun; geçersiz veriyi sessizce silmek yerine ham yedekle birlikte hata verin. Ayarlar ile kişisel içerik/projeler için ayrı geri yükleme politikası belgeleyin.

**Kabul:** Önceki iki sürüm fixture’ları, eksik/ek alan, bozuk JSON, gelecek sürüm, yarım yazılmış dosya; migrasyonun idempotent olması; import başarısızsa mevcut kütüphanenin değişmemesi.

---

## P1 — Altyazı, çeviri ve dublaj kalitesi

### 6. Gerçek medya için küçük, sürümlü “altın kalite” korpusu ve skor panosu

**Kod:** `backend/transcribe.py` (bölme, temizleme, halüsinasyon, zaman normalizasyonu), `backend/sentence_translation.py`, `tools/audit-subtitle-*.js`, `backend/test_transcribe.py`.

**Neden:** Birim testleri fonksiyonların beklenen örneği geçtiğini gösterir; gerçek filmde anlam kaybı, aşırı bölünme, CPS veya zaman taşması değişimini tek başına göstermez. Son notlarda çeviri ve ses kalitesi hâlâ aktif çalışma alanıdır.

**Öneri:** Kamuya açık kısa kliplerden dil/gürültü/konuşmacı/hız bakımından dengeli küçük korpus kur. İnsan doğrulamasıyla beklenen cue, çeviri ve zaman özelliklerini sakla. WER tek başına yeterli değil; eksik cümle, tekrar, aşırı birleştirme, boş hedef, cue başına karakter/saniye ve zaman ihlallerini ayrı raporla. Eşiği gevşetmek yerine her farkı incelemeye aç.

**Kabul:** Aynı fixture’da eski/yeni karşılaştırma raporu; hangi cue’nun neden kötüleştiği; CPU’da hızlı küçük set, gerçek GPU/ücretli sağlayıcıda ayrı ve açık etiketli geniş set. Mock sonucu gerçek kalite diye sunulmamalı.

### 7. Çeviri bağlamını ve kalite kararlarını gözlenebilir, cue kimliğiyle izlenebilir yap

**Kod:** `backend/transcribe.py` (`llm_postprocess`, `translate_cache_key` v5), `backend/sentence_translation.py`, renderer kalite uyarıları ve yeniden çeviri akışları.

**Neden:** Kısa repliklerde yanlış anlam çoğu zaman kaynak cue’dan değil bağlam seçimi veya kabul kapısından doğar. Kullanıcı yalnız son metni görürse hangi bağlamla, hangi model ayarıyla ve hangi gevşek kabulle üretildiğini ayırt etmek zordur.

**Öneri:** Cue kimliğini ASR→çeviri→düzenleme→dublaj boyunca koru. İsteğe bağlı tanı çıktısında kaynak/komşu bağlam, model, cache/TM kaynağı, kalite reddetme nedenleri ve son kabul kararını sakla; API anahtarı veya gereksiz kişisel metin yazma. Tek cue ve seçili aralık yeniden çevirisinde bağlam politikası açık olsun.

**Kabul:** Aynı metnin farklı sahnelerde farklı bağlam anahtarı kullanması; kullanıcı düzeltmesinin otomatik sonuçla ezilmemesi; lenient sonucun TM/cache’e yanlışlıkla temiz kalite olarak girmemesi; raporun secret içermemesi.

### 8. Altyazı zamanlama/bölme için bağımsız doğrulayıcı

**Kod:** `backend/transcribe.py` (`split_segment_*`, `merge_short_entries`, `normalize_timings`, `wrap_text` ve format yazıcıları), `src/renderer/renderer.js` zaman düzenleme yolları.

**Neden:** Bölme, birleştirme ve satır sarma birbirinden farklı işlemlerdir. Bunların ardışık uygulanması sonunda süre taşması, çakışma, okunamayacak kısa cue veya cümle ortası kırılma ortaya çıkabilir. Her adımın kendi testi olsa da son dosya üzerinde ortak invariant denetimi gerekir.

**Öneri:** Saf `validate_subtitles(segments, policy)` katmanı çıkar. `start < end`, medya sınırı, çakışma, minimum süre, maksimum CPS, satır uzunluğu, boş metin ve düzeltilemeyen çakışmaları ayrı şiddetlerle raporlasın. Üretim sonunda ve kullanıcı dışa aktarırken aynı doğrulayıcıyı kullanın.

**Kabul:** Tek uzun cue, kırpılmış video, çok dilli metin, el ile zaman düzenleme, WhisperX kelime zamanları ve re-export’ta aynı invariantlar; uyarı ile engelleyici hatanın ayrımı.

### 9. Dublaj kalite kapısını “dosya oluştu”dan “konuşma eksiksiz ve dinlenebilir”e genişlet

**Kod:** `src/dub-service.js`, backend TTS/normalizasyon kodları, `src/renderer/renderer.js` dublaj kalite paneli, son A/B araçları (`tools` altındaki audition/kabul betikleri).

**Neden:** Son devir notları gerçek GPU örneklerinde kalite ve bütünlük kontrollerinin aktif olduğunu, insan dinleme tercihinin ise hâlâ açık kaldığını gösteriyor. WAV süresinin hedefe uyması tek başına eksik kelime, doğal olmayan hız veya yanlış telaffuz bulunmadığını kanıtlamaz.

**Öneri:** Grup bazında kaynak metin, üretilen metin, ASR doğrulaması, hedef/fiilî süre, hız oranı, clipping/sessizlik ve insan onay durumunu tek kayda bağla. Otomatik kontroller “şüpheli” işareti üretsin; kesin yanlış pozitiflerde kullanıcı incelemesini engellemesin. Akıcı/kısa gruplama tercihi varsayılan olarak değiştirilmeden önce kör A/B sonucu istensin.

**Kabul:** Eksik sayı/olumsuzluk/özel ad, aşırı hız, başta-sonda kırpılma ve uzun sessizlik fixture’ları; tek grubu yeniden üretimde diğer cache hash’lerinin aynı kalması; seçilen sürümün nihai M4B/video çıktısına taşınması.

### 10. Model/GPU bellek bütçesi ve öngörülebilir düşürme politikası

**Kod:** `backend/transcribe.py` motor seçimi, model yükleme/boşaltma, diarization öncesi `del`/cache temizliği; `src/renderer/renderer.js` `estimateVramMib()`; `src/main.js` ortam bilgisi ve backend başlatma.

**Neden:** RTX 4070 Ti hedefi diğer GPU’lar için garanti değildir. Büyük model, pyannote, ayırıcı ve TTS aynı anda bellek isterse uzun işin ortasında OOM olabilir. CPU fallback her alt sistemde aynı kalite/hız davranışını sağlamaz.

**Öneri:** Aşama bazlı kaynak planı çıkar; eşzamanlı GPU işlerini tek scheduler ile sınırla. OOM’da hangi düşüşün güvenli olduğunu (batch, compute type, model, CPU) açıkça belirt ve kullanıcı onayı olmadan kaliteyi sessizce düşürme. Tahmini VRAM ile ölçülen kullanımı tanı kaydında karşılaştır.

**Kabul:** Düşük VRAM simülasyonu ve kontrollü OOM; ikinci işin GPU kilidini beklemesi; modelin aşama sonunda boşaltılması; CPU fallback’in açık etiketi; sıcak motor ile iptal yarışı.

### 11. Ağ/altyazı sağlayıcı ve yt-dlp hatalarını kalıcı, eyleme dönük sınıflandır

**Kod:** `backend/transcribe.py` yt-dlp indirme yolu, `src/main.js` `maintenance:updateYtdlp` ve medya pipe/indirme yolları, browser altyazı yakalama modülleri.

**Neden:** 403, bot doğrulaması, altyazı bulunmaması, DRM, ağ kesilmesi ve bozuk medya aynı “başarısız” mesajına indirgenirse kullanıcı yanlış çözüm dener. Canlı sitelerin davranışı zamanla değiştiği için yalnız statik fixture yeterli değildir.

**Öneri:** Hata sınıfı, yeniden denenebilirlik, kullanıcı eylemi ve hassas olmayan stderr özeti için ortak yapı kullan. Süre/çıktı boyutu sınırı ve exponential backoff uygula; kalıcı kimlik hatasını gereksiz tekrar etme. Canlı site testlerini ayrı, başarısızlığı ana ürün regresyonuyla karıştırmayan etiketli işlerde tut.

**Kabul:** Her hata sınıfı için doğru mesaj ve yeniden deneme davranışı; endpoint/token/log redaksiyonu; YouTube canlı testinin mock başarısından ayrı raporlanması; DRM’in desteklenen capture olarak sunulmaması.

---

## P2 — Mimari, performans ve geliştirici deneyimi

### 12. `backend/transcribe.py` içinden saf altyazı çekirdeğini aşamalı çıkar

**Kod:** `backend/transcribe.py` içindeki timecode, segment bölme, tekrar temizliği, wrap/merge, timing normalize ve writer fonksiyonları.

**Neden:** Yaklaşık 503 KB’lık modülde argparse, ağ, ffmpeg, GPU, çeviri, dosya yazma ve saf metin algoritmaları birlikte bulunuyor. Saf fonksiyonları test etmek mümkün olsa da bağımlılıkları ve sorumluluk sınırlarını anlamak giderek zorlaşır.

**Öneri:** Önce davranışı karakterizasyon testleriyle dondur. Sonra sırasıyla `subtitle_model.py`, `subtitle_timing.py`, `subtitle_text.py`, `subtitle_writers.py` modülleri çıkar; mevcut fonksiyonlar ince uyumluluk sarmalayıcısı olarak kalsın. Aynı PR’da algoritma değiştirme. En son CLI/orchestration ayrılsın.

**Kabul:** Tüm mevcut hedefli backend testleri değişmeden geçmeli; aynı JSON girdisinden byte düzeyinde aynı SRT/VTT/ASS/TXT (BOM politikası dahil) çıkmalı; modül importu ağır GPU bağımlılığı başlatmamalı.

### 13. `main.js` yerine alan bazlı servis sınırları ve tek IPC kayıt noktası

**Kod:** `src/main.js` ve mevcut `src/media-workflows.js`, `src/dub-service.js` gibi ayrılmış modüller.

**Neden:** Yaklaşık 1,08 MB’lık main dosyası pencere, browser, IPC, subprocess, persist ve medya işlerini aynı yerde tutuyor. Yan etkili kodu testte taklit etmek ve yaşam döngüsü yarışlarını görmek zorlaşıyor.

**Öneri:** Önce IPC handler’larını dosya bazlı envanterle eşle. Ardından bağımsız saf parçaları ve hâlihazırda ayrılmış servislerin çağrıcılarını `services/`, `ipc/`, `persistence/`, `windows/` sınırlarına taşı. Her taşıma tek alanla sınırlı olsun; `require` yolları ve preload kanal adları değişmesin. Dev bir “main rewrite” yapma.

**Kabul:** IPC kanal sayısı/adları ve payload sözleşmeleri aynı; gerçek Electron yetki testleri; uygulama açılış/kapanış ve uzun iş sırasında renderer reload smoke’u; her modülün Node testte izole yüklenebilmesi.

### 14. `renderer.js` için özellik bazlı controller ve küçük durum deposu

**Kod:** `src/renderer/renderer.js`, `renderer-helpers.js`, `media-workflows-ui.js`, `media-catalog.js`, `ui-locale.js`.

**Neden:** Yaklaşık 1,59 MB’lık renderer’da DOM, medya olayları, kuyruk, ayar persist ve çok sayıda özellik birbirine dokunuyor. Eski async yanıtın yeni seçime sızması gibi hataların ana çaresi her yere ayrı kontrol eklemek değil, oturum sahipliğini ortaklaştırmaktır.

**Öneri:** İlk çıkarılacak adaylar: mevcut dublaj controller’ı, okuyucu oturumu ve altyazı editörü. Her controller `dispose()` ile listener/timer/abort temizlesin. Async işlerde ortak `sessionId`/`AbortController`; kaydetmede tek şemalı store ve debounce politikası kullanılsın. Global `state` nesnesini bir anda kaldırma.

**Kabul:** Görünüm 20 kez aç/kapa sonrası listener/timer sayısı sabit; eski yanıt yeni kaynağı değiştirmiyor; kuyruğa eklenmiş işin dondurulmuş ayarları değişmiyor; ayar yüklerken geri kayıt oluşmuyor.

### 15. Büyük listeler ve medya panellerinde ölçülebilir performans bütçesi

**Kod:** `src/renderer/renderer.js` transcript/queue/library render yolları, `media-catalog.js`, browser sekme önizlemeleri, `styles.css`.

**Neden:** Binlerce cue, yüzlerce kütüphane öğesi veya çok sayıda sekme için bütün DOM’u yeniden kurmak yazma gecikmesi, odak kaybı ve bellek artışı yaratabilir. Performans sorunu ölçülmeden sanallaştırma eklemek de erişilebilirliği bozabilir.

**Öneri:** Önce uzun liste fixture’ıyla render süresi, DOM düğümü, listener ve heap ölç. Arama/filtrede incremental update veya pencereleme uygula; aktif cue’yu `scrollIntoView` ile sınırla, thumbnail/poster işlerini iptal edilebilir yap. Performans bütçesini smoke teste koy; sanal listede klavye/ekran okuyucu davranışını koru.

**Kabul:** 5.000 cue ve 1.000 katalog öğesiyle belirlenen etkileşim bütçesi; arama sırasında seçim/düzenleme kaybolmaması; görünüm değişiminde eski medya listener’larının artmaması. Eşik donanıma göre ölçülerek belgelenmeli, rastgele seçilmemeli.

### 16. EN/TR yerelleştirmeyi metin envanteri ve testle tamamla

**Kod:** `src/renderer/ui-locale.js`, `index.html`, `renderer.js`, `src/main.js` kullanıcıya dönen hatalar ve backend `log/status/error` olayları.

**Neden:** README ve AGENTS eski tanı metinlerinin bir kısmının hâlâ Türkçe olduğunu açıkça söylüyor. Browser ve yeni medya özellikleri arttıkça sabit metinler ile tek dilde hata mesajları arayüz sözleşmesini bozuyor. Kullanıcının altyazısı veya kitap metni ise kesinlikle arayüz çeviricisine sokulmamalı.

**Öneri:** UI metinlerini kararlı mesaj kimliklerine taşı; backend kullanıcı hatası için `code + params` göndersin, çeviriyi renderer yapsın. Ham teknik log ayrı kalsın. EN/TR anahtar eşliğini CI’da denetle; medya başlığı, altyazı ve kullanıcı notunu muaf tut.

**Kabul:** Tüm görünür kontroller ve yaygın hata akışları iki dilde; eksik anahtar testi; dil değişiminde kaynak/çeviri metinleri değişmiyor; uzun Türkçe metinlerde dar ekran taşması yok.

### 17. Erişilebilirliği modal, sekme, timeline ve dinamik ilerleme akışlarında derinleştir

**Kod:** `src/renderer/index.html`, `styles.css`, `renderer.js` modal/sekme/klavye/ilerleme kodları; mevcut `audit:ui` ve axe araçları.

**Neden:** Statik axe taraması odak tuzağı, odak iadesi, canlı ilerleme duyurusu, medya klavye kısayolları ve sanal listenin tamamını yakalamaz. Uygulamada çok sayıda özel panel ve canlı iş durumu bulunuyor.

**Öneri:** Ortak dialog controller, roving tabindex gereken sekmeler, `aria-live` için throttled durum özeti ve görünür odak standardı uygula. Kısayollar metin girişini ve video kontrolünü yanlışlıkla tetiklemesin. %125/%200 zoom ve yüksek kontrastı gerçek Electron’da doğrula.

**Kabul:** Yalnız klavyeyle ana iş akışları; modal aç/kapada odak iadesi; sekme değişiminde beklenmedik medya komutu yok; ilerleme her cue’da ekran okuyucuyu spamlemiyor; axe + manuel senaryo birlikte raporlanıyor.

### 18. Test piramidini hızlı sözleşme, gerçek Electron ve uzun kabul olarak ayır

**Kod:** `package.json` test scriptleri, `tests/run-all.js`, `tests/run-electron-smokes.js`, `tests/run-resource-soak.js`, backend testleri ve `.github/workflows/`.

**Neden:** 698 Node test dosyası ve 89 Python test dosyası envanteri güçlü; fakat hepsini her küçük değişiklikte beklemek geri bildirim döngüsünü uzatır. Aynı zamanda yalnız Node/jsdom testleri gerçek Electron, GPU, native video ve Windows dosya davranışını kanıtlamaz.

**Öneri:** Değişen modüle göre hedefli test seçici, PR’da hızlı sözleşme paketi, ayrı gerçek Electron/Windows paketi ve zamanlanmış uzun soak/gerçek medya işi tanımla. Test sonucu “ürün hatası / test sözleşmesi kayması / ortam engeli / canlı servis” diye ayrılsın. Uzun testi gizlice atlamak yerine açık etiketle raporla.

**Kabul:** Her ürün alanının en az bir gerçek entegrasyon yolu; başarısızlık nedenleri makinece ayrıştırılabilir; test süresi ve atlananlar görünür; Windows’ta `start.bat`, GPU, DPI, uzun/Türkçe yol ve paketli exe ayrı doğrulanır.

### 19. Paketli Windows uygulamasını temiz makine kabulüyle doğrula

**Kod:** `tools/package-windows.js`, `tools/smoke-windows-package.js`, `install.bat`, `start.bat`, `package.json` ve `docs/INSTALLATION.md`.

**Neden:** Kaynak ağacındaki `node_modules`, `backend/venv` ve `backend/bin` geliştirme ortamında eksik paket dosyalarını maskeleyebilir. Castlabs Electron imzası, Python backend, ffmpeg, DLL PATH’i ve kullanıcı veri yolu paketli uygulamada farklı davranabilir.

**Öneri:** Paketi kaynak klasörden bağımsız geçici konuma al; kişisel profil olmadan başlat; backend/ffmpeg/model indirme veya kurulum yolunu doğrula. Üretim paketine test/log/geçici dosya ve gerçek kullanıcı verisi girmediğini otomatik denetle. Kurulum ve güncelleme için tek destek matrisi yayınla.

**Kabul:** Temiz Windows VM/kullanıcı profili; paketli exe’den kısa yerel ASR, altyazı açma/kaydetme, browser ve dublaj yetenek kontrolü; Türkçe kullanıcı adı/uzun yol; yeniden başlatmada ayar; eksik bağımlılıkta anlaşılır hata. DRM imzası ayrı açık sınır olarak raporlanır.

### 20. Bağımlılık ve vendor güncellemelerini kanıta bağlı hale getir

**Kod:** `package.json`, `package-lock.json`, backend requirements dosyaları, `src/renderer/vendor/`, `THIRD_PARTY_NOTICES.md`, `tools/audit-production-licenses.js` ve offline manifest üreticisi.

**Neden:** Electron/Chromium, PDF.js, HLS, ASR/TTS bağımlılıkları güvenlik ve uyumluluk açısından önemli; fakat toplu yükseltme altyazı render, DRM, GPU ve Windows kurulumunu bozabilir. Vendor edilmiş dosyaların upstream sürümü/patches kaydı yoksa güncelleme riski görünmez.

**Öneri:** Her vendor varlığı için upstream sürüm, kaynak URL, lisans ve yerel yama envanteri tut. Dependabot/scheduled audit öneri üretsin; tek seferde tek riskli bağımlılık yükselt. Electron, PDF/HLS, PyTorch/CUDA için ayrı kabul matrisleri kullan. Offline manifesti CI’da yeniden üretip diff kontrolü yap.

**Kabul:** Kilit/manifest/lisans uyumu; güncelleme öncesi/sonrası aynı smoke; yerel yamaların kaybolmaması; güvenlik açığı taraması ile gerçek istismar edilebilirlik iddiasının karıştırılmaması.

### 21. Ürün mimarisi belgelerini otomatik sözleşme envanterleriyle senkron tut

**Kod:** `AGENTS.md`, `docs/ARCHITECTURE.md`, `README.md`, IPC/backend olay belgeleri ve `docs/raporlar/INDEX.md`.

**Neden:** AGENTS hâlâ temel üç süreçli altyazı mimarisini iyi anlatıyor; ürün ise browser, dublaj, kitap, keşif ve asistan servisleriyle genişledi. Yeni geliştiricinin yalnız eski ana akışı bilmesi yeni bir olay/kanal eklerken kalıcılık veya sahiplik sözleşmesini atlatmasına yol açabilir.

**Öneri:** IPC kanalları, NDJSON olayları, kalıcı dosyalar ve büyük renderer özellikleri için kaynak koddan envanter üret. Mimari belgeye modül sahipliği ve veri akışı diyagramı ekle. Tarihsel raporları ürün dokümanı gibi kullanma; güncel sözleşmeleri ayrı tut. Rapor indeksindeki sıra/açıklama tutarlılığını küçük lint ile denetle.

**Kabul:** Yeni kanal/olay eklenince doküman testi fail olur; README’deki yetenekler gerçek UI yoluyla eşleşir; tarihsel notlar değişmez; kurulum ve başlatma talimatları mevcut scriptlerle doğrulanır.

### 22. Çalışma ağacı ve teslim hijyenini koru; kişisel/üretim artıklarını üründen ayır

**Kod/alan:** repo kökü, `.gitignore`, `docs/raporlar/`, `docs/devir/`, geçici ZIP/exe/log/test çıktıları.

**Neden:** Denetim başlangıcında `DEVIR-NOTU.md`, `docs/OFFLINE-MANIFEST.md` ve `docs/raporlar/INDEX.md` değiştirilmiş; çok sayıda untracked ZIP, exe, rapor, `_repro` ve test çıktısı bulunuyor. Bunlar kullanıcıya ait olabilir; otomatik silinmemeli. Ancak “hangi dosya ürün, hangisi kişisel kanıt” ayrımı zayıflarsa yanlışlıkla yayın veya yanlış teslim riski artar.

**Öneri:** Kişisel dosyaları taşımadan/silmeden envanter çıkar; geçici test çıktıları için repo içinde açık ignore edilmiş tek klasör kullan. Kök raporların kanonik kopyalarını `docs/raporlar/` altında tut. Yayın öncesi `git status`, staged diff ve paket içerik kontrolü zorunlu olsun. Kullanıcı değişikliklerini başka commit’e katma.

**Kabul:** Temiz bir teslim dalında yalnız amaçlanan dosyalar; kişisel veri/secret taraması; hiçbir mevcut dosyanın izinsiz silinmemesi; rapor/devir indekslerinin bağlantıları geçerli.

---

## Önerilen uygulama sırası

### Dalga 1 — 3 küçük, güvenli teslim

1. **M2 + M5:** çıktı/ayar/proje koruma invariantları ve hata enjeksiyonu.
2. **M3 + M4:** süreç sahipliği ve IPC yetki envanteri; önce test, sonra dar düzeltmeler.
3. **M8:** saf altyazı doğrulayıcı ve üretim/dışa aktarma entegrasyonu.

Bunlar kullanıcıya doğrudan güvenilirlik sağlar ve sonraki refactor için koruma ağı oluşturur.

### Dalga 2 — kalite ve gözlenebilirlik

4. **M6 + M7:** altın korpus, cue kimliği ve çeviri karar tanısı.
5. **M9 + M10:** dublaj kalite kaydı ve GPU scheduler.
6. **M11:** indirme/sağlayıcı hata sınıflandırması.

### Dalga 3 — bakım maliyeti

7. **M12 → M13 → M14:** sırayla backend, main ve renderer; her biri ayrı davranış-korumalı PR.
8. **M15–M17:** ölçüm sonrası performans, i18n ve erişilebilirlik.
9. **M18–M22:** CI/paket/bağımlılık/doküman/teslim altyapısının sürekli bakımı.

## Codex için standart görev paketi şablonu

Her madde ayrı çalışmaya dönüştürülürken şu altı satır doldurulmalı:

- **Kapsam:** yalnız ilgili kullanıcı akışı ve dosyalar.
- **Kanıt:** mevcut davranışı gösteren küçük repro veya ölçüm.
- **Değişmeyecek sözleşme:** IPC adları, cue zamanları, kaynak dosya, kullanıcı ayarları vb.
- **Uygulama:** en küçük modül/değişiklik; büyük rewrite yok.
- **Kabul:** hedefli test + Windows/gerçek Electron gerekiyorsa açık kontrol.
- **Sınırlar:** çalıştırılmayan GPU/canlı sağlayıcı/DRM/tam suite açıkça yazılır.

## Bu çalışmanın sınırları

- Ürün kodu değiştirilmedi; bu nedenle maddeler “uygulandı” değil, önceliklendirilmiş iştir.
- Tam `npm test` çalıştırıldı ve **exit 1 / 8 test dosyası başarısız** tamamlandı. Dolayısıyla mevcut ana kopya tam-suite yeşil değildir. Görünen doğrulanmış başarısızlıklardan biri `tests/test_dub_generation_quality.py::GenerationTests::test_stalled_last_request_keeps_completed_cache_for_same_reference`: takılan son istekten sonra aynı referansla korunması beklenen tamamlanmış cache sesi `valid_audio` kontrolünden geçmedi. Bu kırmızı test M1/M2/M9 kapsamında önce incelenmelidir; diğer yedi dosyanın kök nedenleri ayrı ayrı ayrıştırılmadan ürün hatası sayısı verilmemelidir. Electron smoke/soak bu komuta dahil değildir.
- Bu turda canlı ücretli sağlayıcı, gerçek GPU üretimi, DRM veya temiz Windows kurulumu yapılmadı.
- Başlangıçtaki kullanıcı değişiklikleri ve untracked dosyalar korunmalı; bu rapor onların silinmesi/taşınması için yetki değildir.
