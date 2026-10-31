# R821 — Tasarım dışı işlevsel denetim: 3 yeni bug, 1 ayrı öneri

31 Ekim 2026. İncelenen revizyon: **`a0b5b0927acb5c07f9be2f35e94883d57f7de8a2`**, başlangıç dalı `master`; rapor dalı `codex/functional-audit821`. **Hiçbir düzeltme uygulanmadı.** Ürün kodu, testler, ayarlar ve bağımlılıklar değiştirilmedi. Önceki raporların bug toplamlarına ekleme/yeniden sayım yapılmadı.

Üç ajan **GPT-6.1 Sol / medium** ile dışa aktarma/yan çıktılar, sağlayıcı profilleri ve iş merkezi/kuyruk sınırlarını paralel inceledi. Ana ajan kaynakları kontrol etti ve dört kanıtı yayımlanacak yollarından bağımsız yeniden çalıştırdı. Sayı doldurmak için olasılıklar bug sayılmadı. Dosyaların bütünüyle daha önce hiç okunmadığı iddia edilmiyor; yeni olan aşağıdaki özgül üretici–tüketici ve ardışık işlem ilişkileridir.

## Sonuç tablosu

| ID | Öncelik | Yeni doğrulanan davranış | Kanıt düzeyi |
|---|---|---|---|
| F821-01 | P2 | Global iş merkezinden arka plan sekmesindeki altyazı/sayfa/manga işini durdurma isteği reddediliyor. | Değişmemiş producer→row/action→preload→IPC zinciri; 3 olumsuz ve 3 olumlu kontrol. |
| F821-02 | P2 | Aynı kaynağın temiz tekrar işleminden sonra önceki düşük güven raporu diskte güncelmiş gibi kalıyor. | Gerçek `transcribe` iki kez, gerçek yazıcılar ve dosya işlemi; ASR/ses çıkarma kontrollü. |
| F821-03 | P3 | 32 sağlayıcı kapsamı doluyken 33. sağlayıcıya model ekleme sessizce kaydedilmiyor. | Gerçek renderer callback/render ve model/ayar modülleri; jsdom ve kontrollü kaydetme taşıması. |

P2: normal iş akışında yanlış sonuç veya kullanılamayan işlev; geçici çözüm var. P3: yüksek önkoşullu, sınırlı etki; burada 32 ayrı sağlayıcı kapsamı gerektiriyor ve yalnız yeni ekleme kayboluyor. Üç iş türü veya anahtar varyantı ayrı bug olarak çoğaltılmadı. JSON metrik sadakati aşağıda **öneri**, doğrulanmış bug toplamının dışında.

## F821-01 — İş merkezinde arka plan sekmesinin Durdur düğmesi işi durdurmuyor

**Tetikleyici:** B sekmesinde altyazı çevirisi, sayfa çevirisi veya manga çevirisi sürerken A sekmesine geçilir. Global iş merkezinde B'ye ait satırın **Durdur** düğmesine basılır.

**Beklenen:** Kullanıcının hedeflediği canlı iş sahiplik/güncellik kontrolleriyle durdurulmalı; gerekiyorsa kaynak sekmeye güvenle geçilmeli. Global listede sunulan komutun yalnız etkin sekmede kullanılabilmesi gizli bir önkoşul olmamalı.

**Görülen:** Üç iş türünde de `Eski sekme isteği reddedildi.` sonucu geliyor; durdurma tüketicisi çağrılmıyor. B etkinleştirildiğinde aynı düğme zinciri üç türde de tüketiciyi çağırıyor. Bu, yalnız görsel düğme yerleşimi sorunu değildir; komut IPC sınırında işlevsiz kalıyor. Arka plandaki işin sağlayıcı kullanımı kendiliğinden durmaz. Bu kanıt canlı ücret/tüketim miktarını ölçmez.

**Kök ve kaynak:** [main.js:4301](../../src/main.js#L4301) `browserUnifiedJobsSnapshot` bütün sekmelerin işlerini üretir. [renderer.js:23753](../../src/renderer/renderer.js#L23753) `runBrowserTaskAction`, `cancel` için doğrudan `job.tabId` gönderir; etkinleştirme yapmaz. [renderer.js:23795](../../src/renderer/renderer.js#L23795) gerçek satır eylemini bağlar; [renderer.js:23825](../../src/renderer/renderer.js#L23825) global listeyi tüketir. [preload.js:257](../../src/preload.js#L257), [272](../../src/preload.js#L272) ve [301](../../src/preload.js#L301) hedef kimliği IPC'ye taşır. [main.js:15434](../../src/main.js#L15434) `activeRequestedBrowserTab` yalnız etkin sekmeyi kabul eder; [altyazı stop:17805](../../src/main.js#L17805), [sayfa clear:17427](../../src/main.js#L17427) ve [manga clear:17078](../../src/main.js#L17078) bu kapıyı kullanır. Global komut ile yerel etkin-sekme kapısının sözleşmeleri uyuşmuyor.

**Kanıt:** [probe.cjs](evidence821/jobs/probe.cjs), [result.json](evidence821/jobs/result.json). Gerçek `PlayerTaskCenterModel`, üretim kaynaklarından değiştirilmeden alınan producer, satır/action fonksiyonları, gerçek preload metotları ve üç gerçek handler çalıştırıldı. Sekme/job depoları ve son durdurma efektleri kontrollüdür. A etkin/B hedef: **0/3 tüketici çağrısı**, üç ret. B etkin/B hedef: **3/3 çağrı**, sıfır uyarı. Doğal site, gerçek Electron pencere tıklaması ve canlı sağlayıcı testi yapılmadı.

**Öncekilerden farkı:** R301 içindeki R338 etkin-sekme kapısını tek başına güvenlik kontrolü olarak; R353 iş merkezinin busy/render tarafını inceler. Global producer→arka plan komutu→etkin-sekme kapısı bileşimini doğrulamaz. R31-B100 refresh throttle ve R815'in düzeltilmiş queue/close kökleri farklıdır. F19/F44/F48'den 60 tarihsel imza [kapsam kaydında](evidence821/jobs/registry-reviewed.json) korunur. Aynı kökün üç yüzeyi **bir** bug sayıldı.

**Geçici çözüm/kabul ölçütü:** İşi başlatan sekmeye elle dönüp Durdur kullanılabilir. Düzeltme yapılırsa arka plan hedefiyle üç komut başarılı olmalı; yetkisiz gönderen, kapanmış sekme ve eskimiş iş kimliği korumaları sürmeli. Bu raporda uygulanmadı.

## F821-02 — Temiz tekrar işlem eski düşük güven raporunu geçersizleştirmiyor

**Tetikleyici:** Düşük güven raporu seçeneği açıkken aynı kaynak, çıktı klasörü, ad ve ayarlarla iki başarılı işlem yapılır. İlkinde kelime güveni `.20`, ikincisinde `.99`; eşik iki koşuda da `.60`.

**Beklenen:** Güncel işlem artık düşük güvenli kelime bulmadığında önceki işin aynı adlı raporu yeni çıktının yanında güncel teşhis gibi kalmamalı. İşleme ait yan çıktı işlemle birlikte geçersizleştirilmeli veya güncel temiz durumla açıkça değiştirilmelidir. Rapor seçeneği kapalıyken eski dosyaların topluca silinmesi talep edilmiyor.

**Görülen:** İlk koşu `source.json` ve `source.dusuk-guven.txt` üretir; rapor `Kapı (0.20)` der. İkinci koşu JSON'u başarıyla `.99` değerine yeniler, `done` verir, `warnings: []` döndürür ve dosya listesinde yalnız güncel JSON bulunur. Ancak eski `.dusuk-guven.txt` **byte düzeyinde aynı** kalır. Kullanıcı çıktı klasöründe yeni JSON ile çelişen eski teşhisi görür. Mevcut UI dosya manifesti eski raporu doğru biçimde liste dışı bırakıyor; güncel UI göstergesinin yanlış olduğu iddia edilmiyor.

**Kök ve kaynak:** [transcribe.py:8446](../../backend/transcribe.py#L8446) aynı rapor adını `OutputTransaction.stage` ile hazırlar. [transcribe.py:8638](../../backend/transcribe.py#L8638) `write_confidence_report`, güncel düşük kelime sayısı sıfırsa dosya yazmadan `(False, 0, [])` döndürür. [pipeline_control.py:269](../../backend/pipeline_control.py#L269) bulunmayan staged dosyanın girdisini işlemden çıkarır; önceki final rapor için geçersizleştirme/silme işlemi yoktur. Yeni JSON'un commit edilmesi eski isteğe bağlı teşhisi değiştirmez.

**Kanıt:** [probe.py](evidence821/confidence/probe.py), [result.json](evidence821/confidence/result.json). Gerçek parser varsayılanları, `transcribe`, metin/zaman işleme, JSON/rapor yazıcıları ve `OutputTransaction` çalışır. Yalnız `faster_whisper` motoru, ses çıkarma, FFmpeg konumu ve VRAM kontrolü kontrollüdür. Sentetik dört saniyelik WAV, cache, job-temp ve çıktı yolları ayrı kanıt dizinindedir. İkinci JSON'da `.99` bulunması, raporun varlığı/aynılığı ve güncel listede bulunmaması assertion ile doğrulandı. Gerçek konuşma tanıma kalitesi/GPU başarısı iddiası yoktur.

**Öncekilerden farkı:** R114 tek üretimin raporunu gösterir. R293 sıfır güncel düşük kelimede yeni rapor dosyası yazmama kararını tek başına kilitler; bu davranış kendi başına bug sayılmadı. R342 transaction rollback/commit, R464 tek üretim kapsamıdır. Yeni ilişki, **önceki düşük rapor→aynı adlı temiz başarılı tekrar işlem** sırasında yan çıktının güncelliğidir. F18'in 20 mekanizma imzası [kayıtta](evidence821/confidence/registry-reviewed.json); tarihsel p18 bireysel yazıcı kontrolleri bu iki ardışık transcribe koşusunu kapsamaz. R815-B35–40 ASS/VTT kökleri ve F820-01 zaman kaydırma farklıdır.

**Geçici çözüm/kabul ölçütü:** Son `done.files` listesi esas alınmalı; kullanıcı dosyayı elle incelerken eski raporu güncel kabul etmemeli. Olası düzeltmede `.20→.99` ardışık işlemde eski teşhis kalmamalı; iptal/hata anında önceki sağlam çıktıları koruyan transaction davranışı bozulmamalı. Sıfır kelimede dosya üretmeme kararı tek başına kaldırılmak zorunda değildir. Hiçbir değişiklik yapılmadı.

## F821-03 — 33. sağlayıcıya model ekleme sessizce kayboluyor

**Tetikleyici ve sınır:** 32 ayrı geçerli sağlayıcı kapsamı altında model kayıtlıyken yeni bir özel HTTPS endpoint seçilir ve **Add model** ile model eklenir. Bozuk JSON veya gerçek anahtar gerekmez. Bu, çok sayıda sağlayıcı kullananlar için sınır durumudur; olağan birkaç sağlayıcılı akış bozulmuyor.

**Beklenen:** Kapasite doluysa ekleme açık limit/hata sonucu vermeli veya kayıt gerçekten desteklenmelidir.

**Görülen:** Gerçek ekleme callback'i hata vermeden tamamlanır. Bellek 33 kapsam içerir fakat kayıtlı model select'i yalnız boş placeholder gösterir. Serializer 32 kapsam üretir; gerçek ayar sanitizer'ından geçen sonuçta yeni model yoktur, durum metni boştur. **Önceki 32 kayıt korunur**; eski kayıtların silindiği iddia edilmiyor. Yeni model kutusunun değeri durur fakat kaydetme girişimi başarısızdır.

**Kök ve kaynak:** [provider-model-profiles.js:9](../../src/provider-model-profiles.js#L9) toplam sınırı 32 tanımlar. [40](../../src/provider-model-profiles.js#L40) strict doğrulamada sınır hatası verir, normalleştirmenin olağan yolunda ilk 32 kapsam alınır. [addProviderModel:81](../../src/provider-model-profiles.js#L81) sağlayıcı başına 64 model sınırını kontrol ederken toplam kapsam sınırını kontrol etmez. [renderer.js:3841](../../src/renderer/renderer.js#L3841) Add callback'inin ardından [renderProviderModelChoices:3166](../../src/renderer/renderer.js#L3166) ve kaydetme serializer'ı normalleştirince yeni kapsam düşer.

**Kanıt/kontroller:** [probe.cjs](evidence821/provider/probe.cjs), [results.json](evidence821/provider/results.json). Değişmemiş renderer callback/render, gerçek model/anahtar modülleri ve `sanitizeSettings` kullanıldı; DOM jsdom, kaydetme taşıması kontrollüdür. **31→32** ekleme hem listede görünür hem kaydedilir. Aynı sağlayıcıya **65. model** açık hata verir. Anahtar modülündeki `update→serialize` aynı 33→32 varyantını gösterir; tam renderer anahtar akışı çalıştırılmadığı için ilave bug veya uçtan uca anahtar kaybı iddiası değildir. Gerçek anahtar ve ağ isteği kullanılmadı.

**Öncekilerden farkı:** R109 normal ekleme/kalıcılık/scope eşleşmesi; R447/R449 credential kimliği, probe HTTP/OK/timeout kökleri farklıdır. F50-N0983 bounded normalization 40→≤32 davranışını zaten kontrol eder; bu tur normalizer'ın sınırı yeni bug sayılmadı. Yeni invariant, public Add üreticisinin 33'ü kabul edip render/kaydetme tüketicisinde sessizce düşürmesidir. [20 tarihsel F50 imzası](evidence821/provider/registry-reviewed.json) korunur. R815 remediation ve R820 nested-null workflow startup köküyle eşit değildir.

**Geçici çözüm/kabul ölçütü:** Kullanılmayan sağlayıcıdaki modeller kaldırılarak kapsam sayısı azaltılabilir. 32 doluyken 33. ekleme açık hata vermeli veya kalıcı olmalı; mevcut kapsamdaki güncelleme ve 64 model sınırı korunmalıdır. Uygulanmadı.

## Ayrı geliştirme önerisi — G821-01: JSON yeniden dışa aktarımında ASR ölçümlerinin sadakati

[Fidelity probu](evidence821/fidelity/probe.py) gerçek `write_json` ile segmentlerde `avg_logprob`, `no_speech_prob`, `compression_ratio` bulunan geçerli JSON üretir ve gerçek `reexport_from_json` ile yeniden dışa aktarır. [Sonuç](evidence821/fidelity/result.json): bu üç alan sessizce düşer; kaynak bytes, zaman, metin, konuşmacı ve kelime güvenleri korunur. [transcribe.py:9505](../../backend/transcribe.py#L9505) kayıtları yeniden kurarken yalnız zaman/metin/konuşmacı/kelimeleri taşır; [9613](../../backend/transcribe.py#L9613) `write_json` çağrısına `segment_metrics` vermez.

Bu alanları JSON'dan okuyarak yanlış karar veren mevcut renderer/import tüketicisi bulunmadı. `compute_quality_report` doğrudan çağrıldığında risk sayılarının 1/1→0/0 olması bir yetenek gösterimidir; gerçek kullanıcı arayüzü regresyonu diye sunulamaz. Bu nedenle **bug sayısına dahil edilmedi**. İleride yeniden dışa aktarım sözleşmesinin bu alanları koruması veya kaybı açıklaması değerlendirilebilir. Düzeltme yapılmadı.

## Çalıştırma ve doğrulama

Repo kökünden; çıktılar varsayılan olarak yalnız `.uiprev/audit821-*` sentetik dizinlerine yazılır. İstenirse `AUDIT821_OUT` ile her koşuya ayrı çalışma dizini verilir. Ham profil, kişisel dosya ve anahtar kullanılmaz.

```powershell
$env:AUDIT821_HEAD = 'a0b5b0927acb5c07f9be2f35e94883d57f7de8a2'
node docs/raporlar/evidence821/jobs/probe.cjs
node docs/raporlar/evidence821/provider/probe.cjs
& backend/venv/Scripts/python.exe docs/raporlar/evidence821/confidence/probe.py
& backend/venv/Scripts/python.exe docs/raporlar/evidence821/fidelity/probe.py
```

Ana ajan son yayımlanacak dört betiği yeniden çalıştırdı: **4/4 exit 0**; iki CJS sözdizimi kontrolü geçti. Yanlış davranışı doğrulayan assertion'ın PASS olması ürünün düzeldiği anlamına gelmez. Aynı kaynakların canonical LF SHA256 değerleri ve seçilmiş kanıtlar [manifestte](evidence821/manifest.json), ana kontrol kaydı [burada](evidence821/parent-verification.json).

Mevcut kısa kontroller: `node --test --test-isolation=none tests/provider-model-profiles.test.js tests/provider-api-keys.test.js` runner **2/2** ve model iç kontrolü **4** geçti; `node tests/active-jobs-center.test.js` exit 0; `backend/venv/Scripts/python.exe backend/test_golden_matrix.py` **3/3** geçti. Bu kontroller yeni üç invariantın zaten kapsandığını göstermez; ürün testleri değiştirilmedi.

AGENTS, YENI-BILGISAYAR, güncel DEVIR0504, Night1000 README/ilgili 100 imza, R815 mapping/remediation, R820 ve ilgili eski raporlar dedup için incelendi. Opensubtitles hash, NDJSON/process IO, waveform/shot, WAV/reference ve watch-folder yollarında ana ajan yeni güçlü bağımsız bug doğrulamadı; varsayımsal uç durumlar eklenmedi. Kuyruk/pipeline recovery incelemesinde de ikinci bağımsız iş merkezi bulgusu üretilmedi.

**Windows ve sınırlar:** Kanıtlar Windows'ta yerel dosya/UTF-8/Türkçe metinlerle çalıştı. `start.bat`/`install.bat` kaynakları kontrol edildi; normal açılış/kurulum çalıştırılmadı. VM/jsdom kabulü gerçek Electron pencere tıklaması veya dosya seçici kabulü değildir. Canlı site, hesap, ücretli sağlayıcı, doğal ASR/ses kalitesi, fiziksel GPU/CUDA, DRM/native video ve tam ürün entegrasyonu doğrulanmadı. Yeni bağımlılık/şema yok. Tam `npm test` ve CI sonucu beklenmedi; CI kapatılmadı. Ürün değişmediği için yeni düzeltme/regresyon testi eklenmedi. Kanıtlar yalnız bu kaynak revizyonunu bağlar; başka revizyonda HEAD etiketi test sonucu yerine geçmez.
